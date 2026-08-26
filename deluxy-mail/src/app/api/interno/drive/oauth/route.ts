import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { AMBITO_DRIVE, configDrive, indirizzoRitornoDrive, salvaConsensoDrive } from '@/lib/drive'
import { utenteCorrente } from '@/lib/sessione'

// Il giro del consenso per collegare Google Drive.
//
// Due passaggi, stessa rotta:
//   1. senza `code` → si manda la persona da Google a dare il consenso;
//   2. con `code`   → Google la rimanda qui e il codice si scambia con il
//      permesso duraturo (refresh token), che è ciò che serve per scrivere
//      anche domani senza richiedere niente.
//
// ⚠️ Sta sotto `/api/interno`, quindi la protegge il middleware come tutto il
// resto: il ritorno da Google avviene nel browser di chi è già entrato in
// AI Mail. Non va aggiunta alle eccezioni del matcher.
//
// ⚠️ **Questo indirizzo va registrato in Google Cloud Console** fra gli «URI di
// reindirizzamento autorizzati» del client OAuth, IDENTICO:
//   https://deluxy-mail.vercel.app/api/interno/drive/oauth
// Se non combacia carattere per carattere, Google risponde
// `redirect_uri_mismatch` — è lo stesso inciampo che tiene ferma la rubrica di
// Customer Service.

export const dynamic = 'force-dynamic'

// Il biglietto del giro: si scrive in un cookie all'andata e si ripresenta al
// ritorno da Google. ⚠️ Senza, questa rotta accetta un `code` da CHIUNQUE:
// basta un link in una mail (e questa è un'app di posta) aperto da un utente
// già entrato, e il consenso salvato — che è dell'APP, non della persona —
// diventa quello dell'account di chi ha mandato il link.
const COOKIE_STATO = 'aimail_drive_state'

function indirizzoRitorno(req: NextRequest): string {
  // ⚠️ Fonte unica: la stessa stringa che la pagina Impostazioni mostra da
  //    incollare in Google Console. Vedi `indirizzoRitornoDrive`.
  return indirizzoRitornoDrive(req.nextUrl.origin)
}

function torna(req: NextRequest, esito: string, perche?: string): NextResponse {
  const u = new URL('/impostazioni-app', req.nextUrl.origin)
  u.searchParams.set('drive', esito)
  if (perche) u.searchParams.set('perche', perche.slice(0, 200))
  return NextResponse.redirect(u)
}

export async function GET(req: NextRequest) {
  // ⚠️⚠️ SOLO ADMIN. Il consenso che questa rotta salva NON è dell'utente che
  // la apre: sono due righe di `Impostazione` globali, cioè il Drive DI TUTTA
  // L'APP. Il middleware qui chiede solo una sessione valida, e la pagina
  // Impostazioni nasconde il bottone ai non-admin — ma nascondere un bottone
  // non è un cancello: l'indirizzo si digita. Le altre azioni sullo stesso
  // bene (`salvaDriveAction`, le chiavi delle app, il token API) l'admin lo
  // pretendono già.
  // ⚠️ Non si usa `richiediAdmin()`: fa `redirect('/')` e chi arriva qui si
  // ritroverebbe in posta senza sapere perché. Meglio tornare alla pagina da
  // cui è partito, col motivo scritto.
  const u = await utenteCorrente()
  if (!u) return torna(req, 'no', 'Sessione scaduta: rientra e riprova.')
  if (u.ruolo !== 'admin') return torna(req, 'no', 'Solo un amministratore può collegare Google Drive.')

  const o = await configDrive()
  if (!o.id || !o.segreto) return torna(req, 'manca')

  const errore = req.nextUrl.searchParams.get('error')
  if (errore) return torna(req, 'negato', errore)

  const codice = req.nextUrl.searchParams.get('code')

  // Passo 1 — si va a chiedere il consenso.
  if (!codice) {
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    auth.searchParams.set('client_id', o.id)
    auth.searchParams.set('redirect_uri', indirizzoRitorno(req))
    auth.searchParams.set('response_type', 'code')
    auth.searchParams.set('scope', AMBITO_DRIVE)
    // ⚠️ `offline` + `consent` servono a ottenere il permesso DURATURO: senza,
    // Google dà un accesso di un'ora e domani l'app non scrive più. E senza
    // `consent` un account che aveva già autorizzato non riceve un refresh
    // token nuovo, quindi «ricollega» non ricollegherebbe niente.
    auth.searchParams.set('access_type', 'offline')
    auth.searchParams.set('prompt', 'consent')
    // Il biglietto: un numero a caso che torna indietro con Google e che solo
    // questo browser ha in tasca.
    const stato = randomBytes(24).toString('hex')
    auth.searchParams.set('state', stato)
    const vai = NextResponse.redirect(auth)
    vai.cookies.set(COOKIE_STATO, stato, {
      httpOnly: true,
      secure: true,
      // ⚠️ `lax` e non `strict`: il ritorno da Google è una navigazione che
      // arriva da un altro sito, e con `strict` il cookie non verrebbe mandato
      // — il giro fallirebbe sempre.
      sameSite: 'lax',
      path: '/api/interno/drive/oauth',
      maxAge: 600,
    })
    return vai
  }

  // Passo 2 — il codice diventa permesso duraturo.
  // ⚠️ Prima si controlla il biglietto: un `code` arrivato senza il cookie di
  // questo browser non è un ritorno da Google, è qualcuno che ci manda un
  // codice suo.
  const barattolo = await cookies()
  const atteso = barattolo.get(COOKIE_STATO)?.value ?? ''
  const ricevuto = req.nextUrl.searchParams.get('state') ?? ''
  if (!atteso || !ricevuto || atteso !== ricevuto) {
    return torna(req, 'no', 'Il giro del consenso non combacia: riparti da «Collega Drive» su questa pagina.')
  }

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: codice,
        client_id: o.id,
        client_secret: o.segreto,
        redirect_uri: indirizzoRitorno(req),
        grant_type: 'authorization_code',
      }),
      cache: 'no-store',
    })
    const d = (await r.json()) as {
      refresh_token?: string
      access_token?: string
      error?: string
      error_description?: string
    }
    if (!r.ok || !d.refresh_token) {
      const perche =
        d.error_description ??
        d.error ??
        'Google non ha restituito il permesso duraturo: se avevi già collegato quest\'app, revoca l\'accesso da myaccount.google.com e riprova.'
      return torna(req, 'no', perche)
    }

    // Con QUALE account stiamo scrivendo: si annota, o fra un mese nessuno lo
    // ricorda e i file compaiono in un Drive senza che si capisca in quale.
    let email = ''
    if (d.access_token) {
      const chi = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${d.access_token}` },
        cache: 'no-store',
      }).catch(() => null)
      if (chi?.ok) email = ((await chi.json()) as { email?: string }).email ?? ''
    }

    await salvaConsensoDrive(d.refresh_token, email)
    // Il biglietto è servito: si brucia, così non vale una seconda volta.
    const fatto = torna(req, 'ok')
    fatto.cookies.delete(COOKIE_STATO)
    return fatto
  } catch (e) {
    return torna(req, 'no', String(e))
  }
}

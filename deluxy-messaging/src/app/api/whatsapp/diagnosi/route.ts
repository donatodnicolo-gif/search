import { NextResponse } from 'next/server'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { db } from '@/lib/db'
import { numeriCollegati, tokenPerNumero } from '@/lib/numeri-whatsapp'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// DIAGNOSI WHATSAPP: perché non arrivano i messaggi.
//
// Nasce da un blocco reale: webhook verificato, credenziali salvate, e in inbox
// zero messaggi. Da fuori non si distingue fra «Meta non ci chiama», «ci chiama
// ma lo respingiamo» e «arriva ma non lo salviamo», e l'unico modo era far
// cliccare l'operatore a caso nella dashboard di Meta.
//
// Qui l'app usa le credenziali che ha già in cassaforte e CHIEDE A META com'è
// messa. Nessun segreto esce dalla risposta: solo esiti.

const API = 'https://graph.facebook.com/v21.0'

type Esito = {
  passo: string
  ok: boolean | null // null = non si è potuto controllare
  dettaglio: string
}

async function chiedi(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  })
  const corpo = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string; type?: string; code?: number }
  }
  return { ok: res.ok, stato: res.status, corpo }
}

export async function GET() {
  const c = await leggiImpostazioni([
    'waToken',
    'waPhoneNumberId',
    'waBusinessAccountId',
    'metaVerifyToken',
    'metaAppSecret',
  ])
  const esiti: Esito[] = []

  // 1. Quello che dipende solo da noi.
  esiti.push({
    passo: 'Verify token salvato nell’app',
    ok: Boolean(c.metaVerifyToken?.trim()),
    dettaglio: c.metaVerifyToken?.trim()
      ? 'C’è: l’handshake di Meta può funzionare.'
      : 'Manca: la verifica del webhook su Meta fallirà con 403.',
  })
  esiti.push({
    passo: 'App Secret salvato',
    ok: Boolean(c.metaAppSecret?.trim()),
    dettaglio: c.metaAppSecret?.trim()
      ? 'C’è: accettiamo solo richieste firmate da Meta.'
      : 'Manca: il webhook accetta chiunque conosca l’indirizzo. Da riempire.',
  })

  // 2. Ogni numero collegato si controlla da solo: token, numero, iscrizione.
  //    Se non ce n'è nessuno in tabella si ricade sulla vecchia configurazione
  //    singola delle Impostazioni, che è ancora valida per chi ha un numero solo.
  const collegati = await numeriCollegati()
  const daControllare = collegati.length
    ? collegati
        .filter((n) => n.attivo)
        .map((n) => ({
          etichetta: n.brand || n.nome || n.phoneNumberId,
          phoneNumberId: n.phoneNumberId,
          wabaId: n.wabaId,
        }))
    : [
        {
          etichetta: 'numero delle Impostazioni',
          phoneNumberId: c.waPhoneNumberId?.trim() ?? '',
          wabaId: c.waBusinessAccountId?.trim() ?? '',
        },
      ]

  if (!daControllare.some((n) => n.phoneNumberId)) {
    esiti.push({
      passo: 'Numeri WhatsApp collegati',
      ok: false,
      dettaglio: 'Nessuno: aggiungine uno in Numeri WhatsApp, o compila le Impostazioni.',
    })
    return NextResponse.json({ esiti, conclusione: 'Nessun numero da controllare.' })
  }

  for (const n of daControllare) {
    if (!n.phoneNumberId) continue
    const token = (await tokenPerNumero(n.phoneNumberId)).trim()
    if (!token) {
      esiti.push({
        passo: `${n.etichetta} — token`,
        ok: false,
        dettaglio: 'Nessun token: né suo né quello generale delle Impostazioni.',
      })
      continue
    }

    const num = await chiedi(
      `${API}/${n.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      token
    )
    esiti.push({
      passo: `${n.etichetta} — il token vede il numero`,
      ok: num.ok,
      dettaglio: num.ok
        ? `${num.corpo.display_phone_number ?? '?'} (${num.corpo.verified_name ?? '?'}), qualità ${num.corpo.quality_rating ?? 'n/d'}.`
        : `Meta risponde ${num.stato}: ${num.corpo.error?.message ?? 'errore sconosciuto'}.`,
    })
    if (!num.ok) continue

    // LA DOMANDA CHE CONTA: la nostra app è iscritta a quel WhatsApp Business?
    // Senza questa iscrizione Meta non manda NIENTE per quanto il webhook sia
    // verificato — ed è il caso che dall'app non si vede in nessun modo.
    if (!n.wabaId) {
      esiti.push({
        passo: `${n.etichetta} — app iscritta al WhatsApp Business`,
        ok: null,
        dettaglio:
          'Non controllabile: manca il WhatsApp Business Account ID di questo numero (il numero lungo sotto il nome in WhatsApp Manager).',
      })
      continue
    }
    const iscr = await chiedi(`${API}/${n.wabaId}/subscribed_apps`, token)
    const app = (iscr.corpo.data as { whatsapp_business_api_data?: { name?: string } }[]) ?? []
    esiti.push({
      passo: `${n.etichetta} — app iscritta al WhatsApp Business`,
      ok: iscr.ok ? app.length > 0 : false,
      dettaglio: !iscr.ok
        ? `Meta risponde ${iscr.stato}: ${iscr.corpo.error?.message ?? 'errore'}.`
        : app.length
          ? `Iscritte: ${app.map((a) => a.whatsapp_business_api_data?.name ?? '?').join(', ')}.`
          : 'NESSUNA app iscritta: ecco perché non arriva niente. Va iscritta l’app su Meta → WhatsApp → Configurazione.',
    })
  }

  // 4. Cosa è arrivato davvero da noi.
  const [conv, msg] = await Promise.all([db.conversazione.count(), db.messaggio.count()])
  esiti.push({
    passo: 'Messaggi ricevuti finora',
    ok: msg > 0,
    dettaglio:
      msg > 0
        ? `${msg} messaggi in ${conv} conversazioni.`
        : 'Nessuno: se i passi qui sopra sono tutti verdi, manda un messaggio di prova al numero.',
  })

  const rotti = esiti.filter((e) => e.ok === false)
  return NextResponse.json({
    esiti,
    conclusione: rotti.length
      ? `Da sistemare: ${rotti.map((r) => r.passo).join('; ')}.`
      : 'Tutto a posto da questa parte: se non arriva nulla, manda un messaggio di prova.',
  })
}

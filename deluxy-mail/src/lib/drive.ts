import { db } from './db'
import { cifra, decifra } from './crypto'

// ARCHIVIO DEGLI ALLEGATI SU GOOGLE DRIVE.
//
// ⚠️ PERCHÉ OAUTH E NON UN ACCOUNT DI SERVIZIO. Provato il 20/08/2026 con
// l'account di servizio che Marketing usa già (`app-deluxy@deluxy.iam…`), sulla
// cartella condivisa con lui: permesso c'era (`canAddChildren: true`), ma la
// creazione del file torna 403 —
//   «Service Accounts do not have storage quota. Leverage shared drives, or use
//    OAuth delegation instead.»
// Un account di servizio non possiede spazio: i file che crea devono appartenere
// a qualcuno. Le uscite sono due, un **Drive condiviso** (solo con Google
// Workspace) o l'**impersonazione** (idem). Il Drive di destinazione è un Gmail
// personale, quindi resta una strada sola: il consenso di una persona, una volta.
//
// ⚠️ AMBITO `drive.file`, il più stretto che esista: l'app vede **solo i file che
// ha creato lei**. Non può leggere il resto del Drive di chi dà il consenso — ed
// è anche il motivo per cui si crea una cartella propria invece di scrivere in
// una cartella esistente: su una cartella che non ha creato, con questo ambito,
// non potrebbe scrivere.

export const AMBITO_DRIVE = 'https://www.googleapis.com/auth/drive.file'

/**
 * L'indirizzo di ritorno del consenso. **Unica fonte di verita**: lo usano sia
 * la rotta OAuth sia la pagina Impostazioni che lo mostra da incollare in Google
 * Cloud Console.
 *
 * ⚠️ Prima erano DUE stringhe — una calcolata nella rotta, una scritta a mano
 * nella pagina — ed e' esattamente cosi' che nasce un `redirect_uri_mismatch`:
 * l'utente incolla in console quella che LEGGE, mentre l'app manda quella che
 * CALCOLA. Google confronta la stringa intera, carattere per carattere.
 *
 * ⚠️ Non si usa `req.nextUrl.origin` e basta: dietro Vercel l'origine puo'
 * essere quella del DEPLOY (`deluxy-mail-abc123-deluxy.vercel.app`) invece
 * dell'alias, e in console e' registrato l'alias. Se c'e' `APP_URL` comanda quella.
 */
export function indirizzoRitornoDrive(origine?: string): string {
  const pulita = (process.env.APP_URL || origine || 'https://deluxy-mail.vercel.app').trim()
  const base = pulita.endsWith('/') ? pulita.slice(0, -1) : pulita
  return `${base}/api/interno/drive/oauth`
}

export const IMP_ID = 'drive.oauth_client_id'
export const IMP_SEGRETO = 'drive.oauth_client_secret'
export const IMP_REFRESH = 'drive.oauth_refresh'
export const IMP_EMAIL = 'drive.oauth_email'
export const IMP_CARTELLA = 'drive.cartella_id'

/** Il nome della cartella che AI Mail si crea nel Drive di chi dà il consenso. */
const NOME_CARTELLA = 'AI Mail — Allegati'

export type ConfigDrive = {
  id: string | null
  segreto: string | null
  refresh: string | null
  email: string | null
  cartella: string | null
}

/**
 * I due valori di Drive che sono SEGRETI davvero, e che quindi nel database
 * stanno CIFRATI (revisione di sicurezza 27/08/2026).
 *
 * ⚠️⚠️ Prima ci finivano in chiaro, ed erano gli unici: nella tabella delle
 * impostazioni la chiave delle API e le otto chiavi delle app sono AES-GCM da
 * sempre, questi due no — `scrivi()` faceva l'upsert del valore grezzo. Chi
 * fosse arrivato a leggere il database avrebbe trovato il segreto OAuth
 * leggibile, mentre tutto il resto gli restava muto senza APP_SECRET.
 *
 * ⚠️ Il pericolo vero non è quello di oggi ma quello di domani: il REFRESH
 * TOKEN non è ancora stato scritto (Drive non è collegato). Quando lo sarà,
 * quella riga varrà l'accesso duraturo all'archivio degli allegati. Si chiude
 * PRIMA che venga scritta, non dopo.
 *
 * `id`, `email` e `cartella` restano in chiaro: non sono segreti, e leggibili
 * servono a capire a colpo d'occhio quale account è collegato.
 */
const CIFRATI = new Set([IMP_SEGRETO, IMP_REFRESH])

async function leggi(chiavi: string[]): Promise<Map<string, string>> {
  const righe = await db.impostazione.findMany({ where: { chiave: { in: chiavi } } }).catch(() => [])
  return new Map(
    righe.map((r) => {
      const grezzo = (r.valore ?? '').trim()
      if (!grezzo || !CIFRATI.has(r.chiave)) return [r.chiave, grezzo] as const
      try {
        return [r.chiave, decifra(grezzo)] as const
      } catch {
        // ⚠️ RIPIEGO OBBLIGATORIO: le righe scritte prima di oggi sono in
        // chiaro, e `decifra` su un valore non cifrato lancia. Senza questo
        // ramo, il primo deploy avrebbe reso illeggibile la configurazione
        // Drive già inserita: la pagina Impostazioni si sarebbe presentata
        // coi campi vuoti e il collegamento da rifare a mano, senza che
        // niente spiegasse perché. Si rileggono com'erano; alla prima
        // riscrittura diventano cifrate da sole.
        return [r.chiave, grezzo] as const
      }
    })
  )
}

async function scrivi(chiave: string, valore: string): Promise<void> {
  const v = CIFRATI.has(chiave) ? cifra(valore) : valore
  await db.impostazione.upsert({ where: { chiave }, update: { valore: v }, create: { chiave, valore: v } })
}

export async function configDrive(): Promise<ConfigDrive> {
  const m = await leggi([IMP_ID, IMP_SEGRETO, IMP_REFRESH, IMP_EMAIL, IMP_CARTELLA])
  const v = (k: string) => m.get(k) || null
  return { id: v(IMP_ID), segreto: v(IMP_SEGRETO), refresh: v(IMP_REFRESH), email: v(IMP_EMAIL), cartella: v(IMP_CARTELLA) }
}

export async function salvaCredenzialiDrive(id: string, segreto: string): Promise<void> {
  await scrivi(IMP_ID, id.trim())
  await scrivi(IMP_SEGRETO, segreto.trim())
}

export async function salvaConsensoDrive(refresh: string, email: string): Promise<void> {
  await scrivi(IMP_REFRESH, refresh)
  if (email) await scrivi(IMP_EMAIL, email)
}

/**
 * Un permesso d'accesso valido un'ora, ottenuto dal consenso già dato.
 * ⚠️ L'errore si RESTITUISCE, non si nasconde: un collegamento scaduto e un
 * guasto di rete si somigliano, e chi guarda deve sapere quale dei due è.
 */
export async function tokenDrive(): Promise<{ token: string | null; errore: string | null }> {
  const o = await configDrive()
  if (!o.id || !o.segreto || !o.refresh) return { token: null, errore: null }
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: o.id,
        client_secret: o.segreto,
        refresh_token: o.refresh,
        grant_type: 'refresh_token',
      }),
      cache: 'no-store',
    })
    const d = (await r.json()) as { access_token?: string; error?: string; error_description?: string }
    if (!r.ok || !d.access_token) {
      // ⚠️ Un'app OAuth lasciata in stato «Test» fa scadere il consenso dopo
      // SETTE giorni: va detto, o sembra un guasto invece di una scadenza.
      return {
        token: null,
        errore: `Il collegamento a Drive non è più valido (${d.error ?? r.status}): premi di nuovo «Collega Drive». Se succede ogni settimana, l'app OAuth è in stato «Test» su Google Cloud — va pubblicata.`,
      }
    }
    return { token: d.access_token, errore: null }
  } catch (e) {
    return { token: null, errore: `Rinnovo del collegamento fallito: ${String(e).slice(0, 140)}` }
  }
}

/** Cerca una cartella per nome dentro un padre; se non c'è la crea. */
async function cartella(token: string, nome: string, padre?: string): Promise<string | null> {
  const q = [
    `name = '${nome.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
    padre ? `'${padre}' in parents` : "'root' in parents",
  ].join(' and ')
  const cerca = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
  )
  if (cerca.ok) {
    const d = (await cerca.json()) as { files?: { id: string }[] }
    if (d.files?.length) return d.files[0].id
  }
  const crea = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nome,
      mimeType: 'application/vnd.google-apps.folder',
      ...(padre ? { parents: [padre] } : {}),
    }),
    cache: 'no-store',
  })
  if (!crea.ok) return null
  return ((await crea.json()) as { id?: string }).id ?? null
}

/**
 * La cartella dove finisce un allegato: `AI Mail — Allegati / <casella>`.
 * ⚠️ Una sottocartella per CASELLA, non una sola: il Drive è unico per tutta
 * l'azienda mentre in AI Mail ognuno vede solo la propria posta, quindi almeno
 * si capisce di chi è ogni file. Chi ha accesso alla cartella padre li vede
 * comunque tutti: è il prezzo dichiarato di un archivio condiviso.
 */
async function cartellaPerCasella(token: string, casella: string): Promise<string | null> {
  const o = await configDrive()
  let radice = o.cartella
  if (!radice) {
    radice = await cartella(token, NOME_CARTELLA)
    if (!radice) return null
    await scrivi(IMP_CARTELLA, radice)
  }
  return cartella(token, casella || 'senza casella', radice)
}

export type EsitoCarica =
  | { ok: true; id: string; link: string; nome: string }
  | { ok: false; errore: string }

/**
 * Carica un file su Drive e restituisce il link per riaprirlo.
 * ⚠️ Caricamento `multipart`: va bene fino a ~5 MB di richiesta. Sopra, Google
 * vuole il caricamento «resumable» — non serve ancora, ma se un giorno gli
 * allegati grandi falliscono, è lì che si guarda.
 */
export async function caricaSuDrive(
  casella: string,
  nome: string,
  tipo: string,
  dati: Buffer
): Promise<EsitoCarica> {
  const { token, errore } = await tokenDrive()
  if (!token) return { ok: false, errore: errore ?? 'Drive non è collegato: vai in Impostazioni App e premi «Collega Drive».' }

  const padre = await cartellaPerCasella(token, casella)
  if (!padre) return { ok: false, errore: 'Non sono riuscito a creare la cartella su Drive.' }

  const confine = `deluxy${Date.now().toString(36)}`
  const meta = JSON.stringify({ name: nome, parents: [padre] })
  const corpo = Buffer.concat([
    Buffer.from(`--${confine}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${confine}\r\nContent-Type: ${tipo || 'application/octet-stream'}\r\nContent-Transfer-Encoding: base64\r\n\r\n`),
    Buffer.from(dati.toString('base64')),
    Buffer.from(`\r\n--${confine}--`),
  ])

  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${confine}` },
    body: corpo,
    cache: 'no-store',
  })
  const d = (await r.json().catch(() => ({}))) as { id?: string; webViewLink?: string; error?: { message?: string } }
  if (!r.ok || !d.id) {
    return { ok: false, errore: d.error?.message ?? `Drive ha rifiutato il file (HTTP ${r.status}).` }
  }
  return { ok: true, id: d.id, link: d.webViewLink ?? `https://drive.google.com/file/d/${d.id}/view`, nome }
}

export type StatoDrive = {
  configurato: boolean
  collegato: boolean
  email: string | null
  errore: string | null
}

/**
 * ⚠️ «Collegato» NON si deduce dalla presenza del permesso salvato: si MISURA,
 * chiedendo davvero un token a Google. Una credenziale che c'è ma non funziona
 * più è il caso normale (consenso revocato, app in «Test» scaduta dopo 7
 * giorni), ed è la trappola già pagata in Customer Service.
 */
export async function statoDrive(): Promise<StatoDrive> {
  const o = await configDrive()
  const configurato = Boolean(o.id && o.segreto)
  if (!configurato) return { configurato: false, collegato: false, email: null, errore: null }
  if (!o.refresh) return { configurato: true, collegato: false, email: null, errore: null }
  const { token, errore } = await tokenDrive()
  return { configurato: true, collegato: Boolean(token), email: o.email, errore }
}

// Sessione firmata — parte "edge-safe" (Web Crypto), importabile dal middleware.
// L'hashing delle password sta in password.ts (solo Node), perché il middleware
// gira su edge e non può usare node:crypto.

export const SESSION_COOKIE = 'aimail_session'
export const EMAIL_COOKIE = 'aimail_email' // solo per riproporre l'email al login

/**
 * Quanto vale un biglietto, sul SERVER.
 *
 * ⚠️⚠️ Prima questa durata esisteva solo come `maxAge` del cookie, che è una
 * regola del BROWSER: chi si copiava il valore del cookie se lo teneva buono
 * per sempre, perché il server non guardava nessuna data — non ce n'era una
 * dentro il biglietto. Trenta giorni qui e trenta nel cookie dicono la stessa
 * cosa, ma questa la dice a chi decide.
 */
export const DURATA_SESSIONE_MS = 1000 * 60 * 60 * 24 * 30

/**
 * Fino a quando si accettano i biglietti del VECCHIO formato (`userId.firma`).
 *
 * ⚠️⚠️ Serve a non buttare fuori nessuno il giorno del deploy. I vecchi
 * biglietti non hanno dentro né una data né un numero di versione, quindi non
 * si possono né far scadere né revocare: si accettano ancora per una finestra
 * di transizione, e poi basta.
 *
 * ⚠️ La data non è a caso: il cookie è sempre stato scritto con `maxAge` di 30
 * giorni, quindi il browser lo butta da solo entro 30 giorni dall'ultimo
 * accesso. Mettendo il taglio a ~40 giorni da oggi, NESSUNO viene rimandato al
 * login prima di quando ci sarebbe tornato comunque; dopo quella data l'unico
 * formato valido è quello nuovo, che scade e si revoca davvero.
 */
export const TAGLIO_BIGLIETTI_VECCHI = Date.UTC(2026, 9, 6) // 6 ottobre 2026

/** Cosa c'era dentro il biglietto, una volta verificata la firma. */
export type Sessione = {
  userId: string
  /** `null` se è un biglietto del vecchio formato: non porta la versione. */
  versione: number | null
  /** `null` se è un biglietto del vecchio formato: non porta la data. */
  emessoIl: number | null
}

function segreto(): string {
  const s = process.env.APP_SECRET
  if (!s) throw new Error('APP_SECRET mancante: le sessioni non possono essere firmate.')
  return s
}

async function chiaveHmac(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segreto()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function firma(corpo: string): Promise<string> {
  const key = await chiaveHmac()
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(corpo))
  return base64url(sig)
}

/**
 * Crea il cookie di sessione: `v1.userId.versione.emessoIl` più la firma.
 *
 * ⚠️ La `versione` è quella dell'utente al momento del login. Se qualcuno la
 * incrementa (cambio password, disattivazione), tutti i biglietti emessi prima
 * portano un numero diverso e smettono di valere: è l'unico modo di CACCIARE
 * una sessione senza spegnere l'utente.
 */
export async function creaSessione(userId: string, versione: number): Promise<string> {
  const corpo = `v1.${userId}.${versione}.${Date.now()}`
  return `${corpo}.${await firma(corpo)}`
}

/** Confronto a tempo costante fra due stringhe della stessa natura. */
function uguali(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Cosa dice il cookie, se la firma regge e il biglietto non è scaduto.
 *
 * ⚠️ Qui NON si controlla la versione: per farlo bisogna leggere l'utente dal
 * database, e questa funzione la importa anche il middleware, che gira su edge
 * e a Prisma non arriva. Il controllo della versione sta in `utenteCorrente()`
 * (sessione.ts), che l'utente lo carica già. Qui si fa tutto quello che si può
 * fare senza database: firma, formato, scadenza.
 */
export async function verificaSessione(token: string | undefined): Promise<Sessione | null> {
  if (!token) return null
  const punto = token.lastIndexOf('.')
  if (punto <= 0) return null
  const corpo = token.slice(0, punto)
  const dato = token.slice(punto + 1)
  if (!uguali(dato, await firma(corpo))) return null

  // Vecchio formato: il corpo firmato È lo userId, e non c'è altro dentro.
  if (!corpo.startsWith('v1.')) {
    if (Date.now() > TAGLIO_BIGLIETTI_VECCHI) return null
    return { userId: corpo, versione: null, emessoIl: null }
  }

  const parti = corpo.split('.')
  if (parti.length !== 4) return null
  const userId = parti[1]
  const versione = Number(parti[2])
  const emessoIl = Number(parti[3])
  if (!userId || !Number.isFinite(versione) || !Number.isFinite(emessoIl)) return null
  // ⚠️ Anche in avanti: un biglietto con una data futura è un biglietto
  // manomesso o un orologio sballato, e in nessuno dei due casi va bene.
  const eta = Date.now() - emessoIl
  if (eta < 0 || eta > DURATA_SESSIONE_MS) return null
  return { userId, versione, emessoIl }
}

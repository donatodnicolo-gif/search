// Sessione firmata — parte "edge-safe" (Web Crypto), importabile dal middleware.
// L'hashing delle password sta in password.ts (solo Node), perché il middleware
// gira su edge e non può usare node:crypto.

export const SESSION_COOKIE = 'msg_session'

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
 * Il cookie di sessione: `userId.generazione.firma`. Solo noi possiamo firmarlo.
 *
 * ⚠️⚠️ LA GENERAZIONE È DENTRO LA FIRMA, ed è quello che rende la sessione
 * revocabile. Prima il valore era `userId.HMAC(userId)` e non conteneva altro:
 * nessuna scadenza, nessun numero di serie. Conseguenza pratica — **cambiare la
 * password non buttava fuori nessuno**. Chi sospettava un accesso rubato faceva
 * la mossa più naturale del mondo, e l'attaccante restava dentro per i trenta
 * giorni del cookie. L'unica leva vera era cambiare `APP_SECRET`, che però è
 * anche la chiave con cui sono cifrati tutti i segreti dell'app: chiudere una
 * sessione con quella significava rendere illeggibili token Meta, chiavi API e
 * password delle caselle di posta, tutte insieme e in silenzio.
 *
 * ⚠️ Il CONTROLLO della generazione non sta qui: sta in `utenteCorrente()`, che
 * il database lo legge. Questo file gira anche sul middleware (edge), dove il
 * database non c'è — e va bene così: il middleware dice «questo cookie l'ho
 * firmato io», la lettura dell'utente dice «e vale ancora».
 */
export async function creaSessione(userId: string, generazione: number): Promise<string> {
  const corpo = `${userId}.${generazione}`
  return `${corpo}.${await firma(corpo)}`
}

/**
 * Lo userId e la generazione, se il cookie è firmato correttamente.
 *
 * ⚠️ I cookie della vecchia forma (`userId.firma`, due pezzi) **non valgono
 * più**: chi li ha rientra dal login una volta sola. È voluto — una correzione
 * che serve a invalidare le sessioni vecchie e le lascia vive non ha corretto
 * niente.
 */
export async function verificaSessione(
  token: string | undefined
): Promise<{ userId: string; generazione: number } | null> {
  if (!token) return null
  const punto = token.lastIndexOf('.')
  if (punto <= 0) return null
  const corpo = token.slice(0, punto)
  const dato = token.slice(punto + 1)
  const atteso = await firma(corpo)
  // confronto a tempo costante
  if (dato.length !== atteso.length) return null
  let diff = 0
  for (let i = 0; i < dato.length; i++) diff |= dato.charCodeAt(i) ^ atteso.charCodeAt(i)
  if (diff !== 0) return null
  // ⚠️ La generazione è l'ULTIMO pezzo prima della firma: l'id di Prisma è un
  // `cuid` senza punti, ma tagliare dal fondo regge comunque se un giorno
  // cambiasse forma.
  const sep = corpo.lastIndexOf('.')
  if (sep <= 0) return null
  const generazione = Number(corpo.slice(sep + 1))
  if (!Number.isInteger(generazione) || generazione < 0) return null
  return { userId: corpo.slice(0, sep), generazione }
}

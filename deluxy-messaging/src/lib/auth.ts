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

async function firma(userId: string): Promise<string> {
  const key = await chiaveHmac()
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId))
  return base64url(sig)
}

/** Crea il cookie di sessione: `userId.firma`. Solo noi possiamo firmarlo. */
export async function creaSessione(userId: string): Promise<string> {
  return `${userId}.${await firma(userId)}`
}

/** Restituisce lo userId se il cookie è firmato correttamente, altrimenti null. */
export async function verificaSessione(token: string | undefined): Promise<string | null> {
  if (!token) return null
  const punto = token.lastIndexOf('.')
  if (punto <= 0) return null
  const userId = token.slice(0, punto)
  const dato = token.slice(punto + 1)
  const atteso = await firma(userId)
  // confronto a tempo costante
  if (dato.length !== atteso.length) return null
  let diff = 0
  for (let i = 0; i < dato.length; i++) diff |= dato.charCodeAt(i) ^ atteso.charCodeAt(i)
  return diff === 0 ? userId : null
}

import crypto from 'node:crypto'

// Hashing delle password degli utenti: scrypt con sale casuale. Il risultato
// "salt.hash" non è reversibile — nel database non c'è mai una password in
// chiaro. Solo Node (non edge): non importarlo dal middleware.

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}.${hash}`
}

export function verificaPassword(password: string, salvato: string): boolean {
  const [salt, hash] = salvato.split('.')
  if (!salt || !hash) return false
  const calcolato = crypto.scryptSync(password, salt, 64)
  const atteso = Buffer.from(hash, 'hex')
  return calcolato.length === atteso.length && crypto.timingSafeEqual(calcolato, atteso)
}

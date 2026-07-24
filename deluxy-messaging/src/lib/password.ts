import crypto from 'node:crypto'

// Hash delle password degli utenti: scrypt con sale casuale, formato "salt.hash".
// Mai reversibile: al login si ricalcola e si confronta a tempo costante.

export function hashPassword(password: string): string {
  const sale = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, sale, 64).toString('hex')
  return `${sale}.${hash}`
}

export function verificaPassword(password: string, salvata: string): boolean {
  const [sale, hash] = salvata.split('.')
  if (!sale || !hash) return false
  const calcolato = crypto.scryptSync(password, sale, 64)
  const atteso = Buffer.from(hash, 'hex')
  if (calcolato.length !== atteso.length) return false
  return crypto.timingSafeEqual(calcolato, atteso)
}

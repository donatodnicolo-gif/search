import { cookies } from 'next/headers'
import { SESSION_COOKIE, verificaSessione } from './auth'
import { db } from './db'

/** L'utente loggato (dal cookie di sessione firmato), o null. */
export async function utenteCorrente() {
  const negozio = await cookies()
  const userId = await verificaSessione(negozio.get(SESSION_COOKIE)?.value)
  if (!userId) return null
  return db.utente.findUnique({ where: { id: userId } })
}

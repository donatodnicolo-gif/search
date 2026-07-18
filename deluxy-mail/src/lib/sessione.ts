import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Utente } from '@prisma/client'
import { db } from './db'
import { SESSION_COOKIE, verificaSessione } from './auth'

/**
 * L'utente che ha la sessione in corso, o null.
 *
 * Verifica la firma del cookie e ricarica l'utente dal database: se è stato
 * disattivato, la sessione non vale più anche se il cookie è ancora firmato.
 */
export async function utenteCorrente(): Promise<Utente | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const userId = await verificaSessione(token)
  if (!userId) return null
  const u = await db.utente.findUnique({ where: { id: userId } })
  return u && u.attivo ? u : null
}

/**
 * Come utenteCorrente, ma se non c'è nessuno rimanda al login.
 * Da usare in cima a ogni pagina: garantisce che `u.id` esista per filtrare.
 */
export async function richiediUtente(): Promise<Utente> {
  const u = await utenteCorrente()
  if (!u) redirect('/login')
  return u
}

/** Come richiediUtente, ma pretende il ruolo admin. */
export async function richiediAdmin(): Promise<Utente> {
  const u = await richiediUtente()
  if (u.ruolo !== 'admin') redirect('/')
  return u
}

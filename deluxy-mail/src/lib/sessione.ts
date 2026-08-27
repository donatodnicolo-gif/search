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
 *
 * ⚠️⚠️ È QUI che una sessione si può REVOCARE (revisione di sicurezza
 * 27/08/2026). Il biglietto porta dentro il numero di versione che l'utente
 * aveva al login: se qualcuno l'ha incrementato dopo — cambio password,
 * disattivazione — i biglietti vecchi portano un numero diverso e cadono qui,
 * anche se la firma è perfetta e la data ancora buona. Prima non c'era niente
 * del genere: cambiare la password NON cacciava un cookie rubato, e «Esci»
 * cancellava il cookie solo nel browser di chi premeva — il valore restava
 * valido per sempre in mano a chiunque se lo fosse portato via.
 *
 * ⚠️ I biglietti del VECCHIO formato (`versione === null`) non portano nessun
 * numero, quindi non si possono revocare: si accettano solo fino alla data di
 * taglio scritta in auth.ts, e nel frattempo l'unica leva su di loro resta
 * `attivo: false`. È il prezzo di non far rientrare tutti al deploy.
 */
export async function utenteCorrente(): Promise<Utente | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const sessione = await verificaSessione(token)
  if (!sessione) return null
  const u = await db.utente.findUnique({ where: { id: sessione.userId } })
  if (!u || !u.attivo) return null
  if (sessione.versione !== null && sessione.versione !== u.sessioneVersione) return null
  return u
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

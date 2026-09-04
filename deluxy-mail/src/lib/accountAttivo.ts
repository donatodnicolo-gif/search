import { cookies } from 'next/headers'
import { db } from './db'

// L'account "attivo" per il multi-casella: quale casella si sta guardando e da
// quale si invia di default. È una scelta per DISPOSITIVO, tenuta in un cookie
// (non è un segreto): null = «Tutte le caselle» (posta unificata, com'era).

const COOKIE = 'account_attivo'

/** L'id dell'account attivo dal cookie, VALIDATO come casella dell'utente.
 *  null se «Tutte» o se l'id non è (più) una casella dell'utente. */
export async function accountAttivoId(utenteId: string): Promise<string | null> {
  const grezzo = (await cookies()).get(COOKIE)?.value
  if (!grezzo || grezzo === 'tutti') return null
  try {
    const mio = await db.account.findFirst({ where: { id: grezzo, utenteId }, select: { id: true } })
    return mio ? mio.id : null
  } catch {
    return null
  }
}

/** Le caselle dell'utente per il selettore e la scelta del mittente. */
export async function caselleUtente(
  utenteId: string
): Promise<{ id: string; nome: string; email: string; attivo: boolean; firma: string | null }[]> {
  try {
    return await db.account.findMany({
      where: { utenteId },
      orderBy: { id: 'asc' },
      select: { id: true, nome: true, email: true, attivo: true, firma: true },
    })
  } catch {
    return []
  }
}

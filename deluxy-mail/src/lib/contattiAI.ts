import { db } from './db'

// Letture "difensive" delle tabelle nuove (ContattoAI): se la tabella non
// esiste ancora in produzione (migrazione non ancora applicata), invece di far
// crashare la posta in arrivo si degrada a vuoto. Una volta creata la tabella,
// tutto si accende da solo.

export async function emailContattiAI(utenteId: string): Promise<string[]> {
  try {
    const righe = await db.contattoAI.findMany({ where: { utenteId }, select: { email: true } })
    return righe.map((r) => r.email)
  } catch {
    return []
  }
}

export async function eContattoAI(utenteId: string, email: string): Promise<boolean> {
  try {
    const r = await db.contattoAI.findUnique({
      where: { utenteId_email: { utenteId, email: email.toLowerCase() } },
    })
    return r !== null
  } catch {
    return false
  }
}

/** Stato AI del contatto + le sue istruzioni. Difensivo se la tabella manca. */
export async function datiContattoAI(
  utenteId: string,
  email: string
): Promise<{ attivo: boolean; istruzioni: string }> {
  try {
    const r = await db.contattoAI.findUnique({
      where: { utenteId_email: { utenteId, email: email.toLowerCase() } },
      select: { istruzioni: true },
    })
    return { attivo: r !== null, istruzioni: r?.istruzioni ?? '' }
  } catch {
    return { attivo: false, istruzioni: '' }
  }
}

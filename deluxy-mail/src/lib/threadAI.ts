// PLUS AI sulle CONVERSAZIONI: l'AI legge sempre le mail di quel thread, e il
// thread entra nella AI Inbox (come i contatti col PLUS AI).
//
// L'appartenenza è segnata su OGNI mail della conversazione (una riga per
// messaggio): la "chiave" del thread è l'id del messaggio più vecchio e cambia
// agganciando mail vecchie, mentre le liste caricano solo la posta recente —
// segnando tutti i membri, il thread si riconosce da qualunque sua mail.
//
// Letture DIFENSIVE: senza tabella migrata degradano a "nessun thread AI".

import { db } from './db'

/** Gli id di TUTTE le mail che appartengono a conversazioni col PLUS AI. */
export async function idsThreadAI(utenteId: string): Promise<string[]> {
  try {
    const righe = await db.threadAI.findMany({ where: { utenteId }, select: { chiave: true } })
    return righe.map((r) => r.chiave)
  } catch {
    return []
  }
}

/** True se questa conversazione ha il PLUS AI (basta che ce l'abbia una sua mail). */
export async function threadHaAI(utenteId: string, membri: string[]): Promise<boolean> {
  const ids = [...new Set(membri.filter(Boolean))]
  if (ids.length === 0) return false
  try {
    const n = await db.threadAI.count({ where: { utenteId, chiave: { in: ids } } })
    return n > 0
  } catch {
    return false
  }
}

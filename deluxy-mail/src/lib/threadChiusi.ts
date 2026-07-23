// Conversazioni CHIUSE: la pratica è finita. Non compaiono più fra i «Top
// thread» e in elenco portano l'etichetta «Chiuso». Non spariscono dalla posta:
// chiudere è un'etichetta, non un archivio — se arriva una risposta la si vede
// lo stesso (e la si può riaprire).
//
// Come per i nomi e per il PLUS AI, il segno sta su OGNI mail della
// conversazione: la chiave del thread è l'id del messaggio più vecchio e
// cambia agganciando mail vecchie. Letture DIFENSIVE: senza tabella migrata
// degradano a «nessun thread chiuso».

import { db } from './db'

/** Gli id di TUTTE le mail che appartengono a conversazioni chiuse. */
export async function idsThreadChiusi(utenteId: string): Promise<string[]> {
  try {
    const righe = await db.threadChiuso.findMany({ where: { utenteId }, select: { chiave: true } })
    return righe.map((r) => r.chiave)
  } catch {
    return []
  }
}

/** True se questa conversazione è chiusa (basta che lo sia una sua mail). */
export async function threadEChiuso(utenteId: string, membri: string[]): Promise<boolean> {
  const ids = [...new Set(membri.filter(Boolean))]
  if (ids.length === 0) return false
  try {
    return (await db.threadChiuso.count({ where: { utenteId, chiave: { in: ids } } })) > 0
  } catch {
    return false
  }
}

// Il NOME dato a mano a una conversazione ("Trasferte LimoLane"): l'oggetto
// spesso non dice niente ("Re: IMPORTANTE: 106654/26 …") e il nome serve a
// ritrovare lo scambio e a cercarlo.
//
// Chiave = l'id del messaggio CAPOSTIPITE del thread (`chiaveThread`), la
// stessa usata da RiassuntoThread e IstruzioneThread.
//
// Tutte le letture sono DIFENSIVE: se la tabella non è ancora migrata
// degradano a "nessun nome" invece di rompere la pagina.

import { db } from './db'

/**
 * I nomi di una lista di conversazioni, uno per gruppo (null se non ne ha).
 *
 * ⚠️ PERCHÉ NON BASTA LA CHIAVE. `chiaveThread` è l'id del messaggio più
 * VECCHIO del gruppo, e quel messaggio dipende da quali mail sono state
 * caricate: la pagina di un messaggio raccoglie anche le mail agganciate a mano
 * (di qualunque età), mentre le liste guardano solo la posta recente.
 * Agganciando una mail vecchia, la chiave calcolata nelle liste cambiava e il
 * nome «spariva». Qui il nome si cerca su TUTTI i messaggi del gruppo: se è
 * stato salvato su uno qualsiasi di essi, si trova comunque.
 */
export async function nomiPerGruppi(
  utenteId: string,
  gruppi: { id: string }[][]
): Promise<(string | null)[]> {
  const tutti = [...new Set(gruppi.flat().map((m) => m.id))]
  if (tutti.length === 0) return gruppi.map(() => null)

  let perChiave = new Map<string, string>()
  try {
    const righe = await db.nomeThread.findMany({
      where: { utenteId, chiave: { in: tutti } },
      select: { chiave: true, nome: true },
    })
    perChiave = new Map(righe.map((r) => [r.chiave, r.nome]))
  } catch {
    return gruppi.map(() => null) // tabella non ancora migrata
  }
  if (perChiave.size === 0) return gruppi.map(() => null)

  return gruppi.map((g) => {
    for (const m of g) {
      const nome = perChiave.get(m.id)
      if (nome) return nome
    }
    return null
  })
}

/** I nomi delle conversazioni indicate, per chiave. Vuota se non ce ne sono. */
export async function nomiPerChiavi(utenteId: string, chiavi: string[]): Promise<Map<string, string>> {
  const puliti = [...new Set(chiavi.filter(Boolean))]
  if (puliti.length === 0) return new Map()
  try {
    const righe = await db.nomeThread.findMany({
      where: { utenteId, chiave: { in: puliti } },
      select: { chiave: true, nome: true },
    })
    return new Map(righe.map((r) => [r.chiave, r.nome]))
  } catch {
    return new Map() // tabella non ancora migrata
  }
}

/** Il nome di UNA conversazione. `membri` = gli id di tutte le sue mail: il
 *  nome può essere stato salvato su una qualsiasi di esse (vedi sopra). */
export async function nomeDiThread(
  utenteId: string,
  chiave: string,
  membri: string[] = []
): Promise<string | null> {
  const chiavi = [...new Set([chiave, ...membri].filter(Boolean))]
  if (chiavi.length === 0) return null
  try {
    const righe = await db.nomeThread.findMany({
      where: { utenteId, chiave: { in: chiavi } },
      select: { chiave: true, nome: true },
    })
    if (righe.length === 0) return null
    // Se c'è quello salvato sulla chiave canonica si preferisce quello.
    return righe.find((r) => r.chiave === chiave)?.nome ?? righe[0].nome
  } catch {
    return null
  }
}

/** Le chiavi delle conversazioni il cui NOME contiene il testo cercato. */
export async function chiaviPerNome(utenteId: string, q: string): Promise<string[]> {
  const testo = q.trim()
  if (testo.length < 2) return []
  try {
    const righe = await db.nomeThread.findMany({
      where: { utenteId, nome: { contains: testo, mode: 'insensitive' } },
      select: { chiave: true },
      take: 50,
    })
    return righe.map((r) => r.chiave)
  } catch {
    return []
  }
}

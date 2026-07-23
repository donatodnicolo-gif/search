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

/** Il nome di UNA conversazione (null se non ne ha). */
export async function nomeDiThread(utenteId: string, chiave: string): Promise<string | null> {
  if (!chiave) return null
  try {
    const r = await db.nomeThread.findFirst({ where: { utenteId, chiave }, select: { nome: true } })
    return r?.nome ?? null
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

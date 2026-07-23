// Allegati GRANDI: ricomposizione dei pezzi caricati prima dell'invio.
//
// Il browser li ha spediti a blocchi da ~3 MB su /api/allegato-carica perché su
// Vercel il corpo di UNA richiesta non può superare 4,5 MB. Qui si rimettono
// insieme, in ordine, e si cancellano: sono file di passaggio, non archivio.

import { db } from './db'

export type AllegatoRicomposto = { filename: string; content: Buffer; contentType?: string }

/** I file di un gruppo, ricomposti dai loro pezzi (in ordine). */
export async function allegatiDelGruppo(utenteId: string, gruppo: string): Promise<AllegatoRicomposto[]> {
  const g = gruppo.trim()
  if (!g) return []

  let pezzi: { file: number; parte: number; nome: string; tipo: string; dati: Buffer }[] = []
  try {
    pezzi = (await db.allegatoCaricato.findMany({
      where: { utenteId, gruppo: g },
      orderBy: [{ file: 'asc' }, { parte: 'asc' }],
      select: { file: true, parte: true, nome: true, tipo: true, dati: true },
    })) as typeof pezzi
  } catch {
    return [] // tabella non ancora migrata: si invia senza (meglio che fallire)
  }

  const perFile = new Map<number, { nome: string; tipo: string; blocchi: Buffer[] }>()
  for (const p of pezzi) {
    const voce = perFile.get(p.file) ?? { nome: p.nome, tipo: p.tipo, blocchi: [] }
    voce.blocchi.push(Buffer.from(p.dati))
    perFile.set(p.file, voce)
  }

  return [...perFile.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => ({
      filename: v.nome,
      content: Buffer.concat(v.blocchi),
      contentType: v.tipo || undefined,
    }))
}

/** Butta i pezzi di un gruppo: si chiama a invio finito (riuscito o meno). */
export async function scartaGruppo(utenteId: string, gruppo: string): Promise<void> {
  const g = gruppo.trim()
  if (!g) return
  try {
    await db.allegatoCaricato.deleteMany({ where: { utenteId, gruppo: g } })
  } catch {
    /* niente di grave: la pulizia a 24h li toglie comunque */
  }
}

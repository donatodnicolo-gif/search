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

/** Il gruppo che tiene gli allegati di una bozza. */
export function gruppoBozza(bozzaId: string): string {
  return `bozza:${bozzaId}`
}

/**
 * Mette gli allegati di una bozza al riparo, così che riaprendola ci siano
 * ancora.
 *
 * ⚠️ Perché serve: fino al 21/08/2026 salvare una bozza chiamava
 * `scartaGruppo` sui pezzi caricati — quindi non solo la bozza non li
 * conservava: salvarla li **buttava via**. Un allegato in partenza non vive da
 * nessun'altra parte (quello di una mail ricevuta sta sul server IMAP, questo
 * esiste solo nel browser finché non parte), quindi o lo si tiene qui o è perso.
 *
 * ⚠️ Si RIMPIAZZA il contenuto del gruppo, non si accoda: la bozza salvata
 * rispecchia quello che c'è nel modulo in questo momento, altrimenti togliendo
 * un allegato e risalvando resterebbe attaccato per sempre.
 *
 * ⚠️ Ogni file entra come UN pezzo solo (`parte: 0`): qui non c'è il tetto dei
 * 4,5 MB per richiesta, i byte sono già sul server.
 */
export async function conservaPerBozza(
  utenteId: string,
  bozzaId: string,
  allegati: AllegatoRicomposto[]
): Promise<string | null> {
  const gruppo = gruppoBozza(bozzaId)
  try {
    await db.allegatoCaricato.deleteMany({ where: { utenteId, gruppo } })
    if (allegati.length === 0) return null
    await db.allegatoCaricato.createMany({
      data: allegati.map((x, i) => ({
        utenteId,
        gruppo,
        file: i,
        parte: 0,
        nome: x.filename,
        tipo: x.contentType ?? '',
        // ⚠️ `new Uint8Array`: Prisma vuole i byte così, un Buffer generico
        //    non gli basta come tipo.
        dati: new Uint8Array(x.content),
      })),
    })
    return gruppo
  } catch {
    // Tabella non migrata o scrittura rifiutata: la bozza si salva lo stesso,
    // senza allegati. Meglio perdere gli allegati che il testo.
    return null
  }
}

/** Nome, tipo e peso dei file di un gruppo, SENZA tirarsi dietro i byte. */
export async function elencoGruppo(
  utenteId: string,
  gruppo: string
): Promise<{ nome: string; tipo: string; byte: number }[]> {
  const g = gruppo.trim()
  if (!g) return []
  try {
    const righe = await db.$queryRaw<{ nome: string; tipo: string; byte: bigint }[]>`
      SELECT "nome", "tipo", SUM(octet_length("dati"))::bigint AS byte
        FROM "AllegatoCaricato"
       WHERE "utenteId" = ${utenteId} AND "gruppo" = ${g}
       GROUP BY "file", "nome", "tipo"
       ORDER BY MIN("file")`
    return righe.map((r) => ({ nome: r.nome, tipo: r.tipo, byte: Number(r.byte) }))
  } catch {
    return []
  }
}

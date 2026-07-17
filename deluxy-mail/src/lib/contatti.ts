import { db } from './db'

export type Contatto = {
  email: string
  nome: string | null
  messaggi: number
  ultimo: Date
  daRispondere: number
}

/**
 * I contatti non sono una tabella: si ricavano dai messaggi.
 *
 * Un elenco salvato a parte andrebbe tenuto in sincrono a ogni scarico, a ogni
 * cancellazione, a ogni cambio di nome del mittente — e prima o poi divergerebbe.
 * Derivarlo dalla posta lo rende sempre vero per definizione.
 */
export async function elencoContatti(cerca?: string): Promise<Contatto[]> {
  const filtro = cerca?.trim()
    ? {
        OR: [
          { mittente: { contains: cerca.trim(), mode: 'insensitive' as const } },
          { mittenteNome: { contains: cerca.trim(), mode: 'insensitive' as const } },
        ],
      }
    : {}

  const gruppi = await db.messaggio.groupBy({
    by: ['mittente'],
    where: filtro,
    _count: { _all: true },
    _max: { data: true },
    orderBy: { _max: { data: 'desc' } },
    take: 200,
  })
  if (gruppi.length === 0) return []

  const indirizzi = gruppi.map((g) => g.mittente)

  // Il nome più recente con cui quel mittente si è presentato: distinct tiene
  // la prima riga di ogni gruppo, e l'ordine per data decrescente la rende la
  // più recente.
  const nomi = await db.messaggio.findMany({
    where: { mittente: { in: indirizzi } },
    distinct: ['mittente'],
    orderBy: { data: 'desc' },
    select: { mittente: true, mittenteNome: true },
  })
  const nomePer = new Map(nomi.map((n) => [n.mittente, n.mittenteNome]))

  const daRispondere = await db.messaggio.groupBy({
    by: ['mittente'],
    where: { mittente: { in: indirizzi }, serveRisposta: true, archiviato: false },
    _count: { _all: true },
  })
  const rispostePer = new Map(daRispondere.map((r) => [r.mittente, r._count._all]))

  return gruppi.map((g) => ({
    email: g.mittente,
    nome: nomePer.get(g.mittente) ?? null,
    messaggi: g._count._all,
    ultimo: g._max.data ?? new Date(0),
    daRispondere: rispostePer.get(g.mittente) ?? 0,
  }))
}

/** Iniziali per l'avatar: dal nome se c'è, altrimenti dall'indirizzo. */
export function iniziali(nome: string | null, email: string): string {
  const base = (nome || email.split('@')[0] || '?').trim()
  const parti = base.split(/[\s._-]+/).filter(Boolean)
  const lettere = parti.length >= 2 ? parti[0][0] + parti[1][0] : base.slice(0, 2)
  return lettere.toUpperCase()
}

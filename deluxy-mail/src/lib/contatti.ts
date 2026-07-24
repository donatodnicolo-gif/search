import { db } from './db'

export type Contatto = {
  email: string
  nome: string | null
  /** Alias dato a mano (es. «Nicolò Deluxy»): capito anche dall'AI. */
  alias?: string | null
  messaggi: number
  ultimo: Date
  daRispondere: number
}

/** La mappa email→alias dell'utente (email minuscola). Difensiva: senza tabella
 *  migrata torna vuota. */
export async function aliasContatti(utenteId: string): Promise<Map<string, string>> {
  try {
    const righe = await db.aliasContatto.findMany({ where: { utenteId }, select: { email: true, alias: true } })
    return new Map(righe.map((r) => [r.email.toLowerCase(), r.alias]))
  } catch {
    return new Map()
  }
}

/** La rubrica nella forma che serve all'AI: il «nome» include l'alias, così un
 *  «invia a Nicolò Deluxy» combacia. */
export function contattiPerAI(contatti: Contatto[]): { email: string; nome: string | null }[] {
  return contatti.map((c) => ({
    email: c.email,
    // Alias davanti (è quello che l'utente dice), nome vero fra parentesi.
    nome: c.alias ? (c.nome ? `${c.alias} (${c.nome})` : c.alias) : c.nome,
  }))
}

/**
 * I contatti si ricavano dai messaggi dell'utente. Sempre filtrati per
 * utenteId: nessuno vede i contatti di un altro.
 */
export async function elencoContatti(utenteId: string, cerca?: string): Promise<Contatto[]> {
  const testo = cerca?.trim()
  const filtro = {
    utenteId,
    ...(testo
      ? {
          OR: [
            { mittente: { contains: testo, mode: 'insensitive' as const } },
            { mittenteNome: { contains: testo, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

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

  const nomi = await db.messaggio.findMany({
    where: { utenteId, mittente: { in: indirizzi } },
    distinct: ['mittente'],
    orderBy: { data: 'desc' },
    select: { mittente: true, mittenteNome: true },
  })
  const nomePer = new Map(nomi.map((n) => [n.mittente, n.mittenteNome]))

  const daRispondere = await db.messaggio.groupBy({
    by: ['mittente'],
    where: { utenteId, mittente: { in: indirizzi }, serveRisposta: true, archiviato: false },
    _count: { _all: true },
  })
  const rispostePer = new Map(daRispondere.map((r) => [r.mittente, r._count._all]))

  const daMittenti: Contatto[] = gruppi.map((g) => ({
    email: g.mittente,
    nome: nomePer.get(g.mittente) ?? null,
    messaggi: g._count._all,
    ultimo: g._max.data ?? new Date(0),
    daRispondere: rispostePer.get(g.mittente) ?? 0,
  }))

  // Anche chi hai SCRITTO tu entra in rubrica: i destinatari delle mail inviate,
  // non solo chi ti ha scritto. Così un contatto a cui mandi una mail resta
  // salvato (e Renè può usarlo come destinatario di un recap). Non serve un
  // salvataggio esplicito: la mail inviata registra già i destinatari.
  const giaPresenti = new Set(daMittenti.map((c) => c.email.toLowerCase()))
  const mieEmail = new Set(
    (await db.account.findMany({ where: { utenteId }, select: { email: true } })).map((a) => a.email.toLowerCase())
  )
  const inviate = await db.messaggio.findMany({
    where: { utenteId, direzione: 'uscita' },
    select: { destinatari: true, data: true },
    orderBy: { data: 'desc' },
    take: 500,
  })
  const reEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
  const filtroTesto = testo?.toLowerCase()
  const rec = new Map<string, { email: string; messaggi: number; ultimo: Date }>()
  for (const m of inviate) {
    for (const raw of m.destinatari.match(reEmail) ?? []) {
      const email = raw.toLowerCase()
      if (mieEmail.has(email) || giaPresenti.has(email)) continue
      if (filtroTesto && !email.includes(filtroTesto)) continue
      const e = rec.get(email)
      if (e) {
        e.messaggi++
        if (m.data > e.ultimo) e.ultimo = m.data
      } else {
        rec.set(email, { email: raw, messaggi: 1, ultimo: m.data })
      }
    }
  }
  const daInvii: Contatto[] = [...rec.values()].map((r) => ({
    email: r.email,
    nome: null,
    messaggi: r.messaggi,
    ultimo: r.ultimo,
    daRispondere: 0,
  }))

  const tutti = [...daMittenti, ...daInvii].sort((a, b) => b.ultimo.getTime() - a.ultimo.getTime())

  // Alias: uno per email. Entra nella rubrica e (via i chiamanti) anche nella
  // lista che va all'AI, così «invia a Nicolò Deluxy» si risolve.
  const alias = await aliasContatti(utenteId)
  for (const c of tutti) c.alias = alias.get(c.email.toLowerCase()) ?? null

  // In ricerca: se il testo combacia con un alias, il contatto deve uscire
  // anche se l'alias non è nel nome/indirizzo.
  if (testo) {
    const t = testo.toLowerCase()
    const giaInRubrica = new Set(tutti.map((c) => c.email.toLowerCase()))
    for (const [email, al] of alias) {
      if (al.toLowerCase().includes(t) && !giaInRubrica.has(email)) {
        tutti.push({ email, nome: null, alias: al, messaggi: 0, ultimo: new Date(0), daRispondere: 0 })
      }
    }
  }

  return tutti
}

export function iniziali(nome: string | null, email: string): string {
  const base = (nome || email.split('@')[0] || '?').trim()
  const parti = base.split(/[\s._-]+/).filter(Boolean)
  const lettere = parti.length >= 2 ? parti[0][0] + parti[1][0] : base.slice(0, 2)
  return lettere.toUpperCase()
}

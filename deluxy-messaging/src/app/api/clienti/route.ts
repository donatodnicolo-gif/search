import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { googleAccessToken } from '@/lib/contatti'

export const dynamic = 'force-dynamic'

// Rubrica clienti: non è una tabella a sé, si ricava dagli ordini raggruppando
// per persona (ultime 9 cifre del telefono, altrimenti email). Così la rubrica
// è sempre allineata agli ordini scaricati, senza dati duplicati.

export type ClienteDto = {
  chiave: string
  nome: string
  telefono: string
  email: string
  citta: string
  negozi: string[]
  ordini: number
  speso: number
  ultimoNumero: string
  ultimaData: string
  inRubrica: boolean
}

function chiaveDi(telefono: string, email: string): string {
  const cifre = telefono.replace(/[^\d]/g, '')
  if (cifre.length >= 6) return 'tel:' + cifre.slice(-9)
  if (email.trim()) return 'mail:' + email.trim().toLowerCase()
  return ''
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const q = (p.get('q') ?? '').trim()
  const soloDaSalvare = p.get('rubrica') === 'no'

  const dove: Prisma.OrdineWhereInput = {}
  if (q) {
    const testo: Prisma.StringFilter = { contains: q, mode: 'insensitive' }
    dove.OR = [{ clienteNome: testo }, { telefono: testo }, { email: testo }, { citta: testo }]
    const cifre = q.replace(/[^\d]/g, '')
    if (cifre.length >= 4) dove.OR.push({ telefono: { contains: cifre } })
  }

  const [ordini, token] = await Promise.all([
    // Ordinati dal più recente: il primo di ogni gruppo è l'ultimo ordine.
    db.ordine.findMany({ where: dove, orderBy: { data: 'desc' } }),
    googleAccessToken().catch(() => null),
  ])

  const mappa = new Map<string, ClienteDto>()
  for (const o of ordini) {
    const chiave = chiaveDi(o.telefono, o.email)
    if (!chiave) continue
    const esistente = mappa.get(chiave)
    if (esistente) {
      esistente.ordini++
      esistente.speso += o.totale
      if (!esistente.negozi.includes(o.negozioNome)) esistente.negozi.push(o.negozioNome)
      // i campi mancanti si completano con quelli degli ordini più vecchi
      if (!esistente.email && o.email) esistente.email = o.email
      if (!esistente.citta && o.citta) esistente.citta = o.citta
      if (!esistente.nome && o.clienteNome) esistente.nome = o.clienteNome
      if (o.contattoSalvato) esistente.inRubrica = true
    } else {
      mappa.set(chiave, {
        chiave,
        nome: o.clienteNome,
        telefono: o.telefono,
        email: o.email,
        citta: o.citta,
        negozi: o.negozioNome ? [o.negozioNome] : [],
        ordini: 1,
        speso: o.totale,
        ultimoNumero: o.numero,
        ultimaData: o.data.toISOString(),
        inRubrica: o.contattoSalvato,
      })
    }
  }

  let clienti = [...mappa.values()]
  if (soloDaSalvare) clienti = clienti.filter((c) => !c.inRubrica)

  // Ordinamento (come in Deluxy Orders): più spesa, più ordini, più recenti, nome.
  const ordina = p.get('ordina') ?? 'recenti'
  const per: Record<string, (a: ClienteDto, b: ClienteDto) => number> = {
    speso: (a, b) => b.speso - a.speso,
    ordini: (a, b) => b.ordini - a.ordini,
    recenti: (a, b) => b.ultimaData.localeCompare(a.ultimaData),
    nome: (a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'),
  }
  clienti.sort(per[ordina] ?? per.recenti)

  // Riepiloghi sull'insieme intero, non solo sulla pagina mostrata.
  const inRubrica = clienti.filter((c) => c.inRubrica).length
  const spesoTotale = clienti.reduce((s, c) => s + c.speso, 0)

  return NextResponse.json({
    totale: clienti.length,
    inRubrica,
    spesoTotale,
    clienti: clienti.slice(0, 300),
    googleCollegato: !!token,
  })
}

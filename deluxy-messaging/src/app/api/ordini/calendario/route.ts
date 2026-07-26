import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Ordini di un mese per DATA DI CONSEGNA (non data d'ordine): è la domanda
// operativa del calendario — cosa esce, e in che giorno.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const mese = (p.get('mese') ?? '').trim() // YYYY-MM
  const negozio = (p.get('negozio') ?? '').trim()

  const oggi = new Date()
  const [anno, m] = mese.match(/^\d{4}-\d{2}$/)
    ? mese.split('-').map(Number)
    : [oggi.getFullYear(), oggi.getMonth() + 1]

  // Estremi del mese in ora locale; la consegna è salvata a mezzanotte UTC.
  const dal = new Date(Date.UTC(anno, m - 1, 1, 0, 0, 0))
  const al = new Date(Date.UTC(anno, m, 0, 23, 59, 59))

  const dove: Prisma.OrdineWhereInput = { dataConsegna: { gte: dal, lte: al } }
  if (negozio) dove.negozioId = negozio

  const [ordini, negozi, senzaData] = await Promise.all([
    db.ordine.findMany({
      where: dove,
      orderBy: [{ dataConsegna: 'asc' }, { fasciaConsegna: 'asc' }],
      select: {
        id: true,
        numero: true,
        negozioNome: true,
        clienteNome: true,
        citta: true,
        totale: true,
        valuta: true,
        dataConsegna: true,
        fasciaConsegna: true,
        statoChiave: true,
        statoNome: true,
        statoColore: true,
      },
    }),
    db.negozioShopify.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    // quanti ordini non hanno una data di consegna: vanno detti, non nascosti
    db.ordine.count({ where: { dataConsegna: null } }),
  ])

  // Legenda: gli stati presenti nel mese, col loro colore.
  const stati = new Map<string, { chiave: string; nome: string; colore: string; quanti: number }>()
  for (const o of ordini) {
    const chiave = o.statoChiave || 'senza-stato'
    const gia = stati.get(chiave)
    if (gia) gia.quanti++
    else
      stati.set(chiave, {
        chiave,
        nome: o.statoNome || 'Senza stato',
        colore: o.statoColore || '#6e6e73',
        quanti: 1,
      })
  }

  return NextResponse.json({
    mese: `${anno}-${String(m).padStart(2, '0')}`,
    ordini: ordini.map((o) => ({
      ...o,
      giorno: o.dataConsegna ? o.dataConsegna.toISOString().slice(0, 10) : '',
    })),
    stati: [...stati.values()].sort((a, b) => b.quanti - a.quanti),
    negozi,
    senzaData,
  })
}

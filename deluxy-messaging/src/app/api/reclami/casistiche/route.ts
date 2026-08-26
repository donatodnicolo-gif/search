import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { gravitaValida } from '@/lib/reclami'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Le casistiche di reclamo: il catalogo dei tipi di problema, con le azioni
// consigliate e la colpa tipica. Si configurano una volta e si riusano.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const soloAttive = req.nextUrl.searchParams.get('attive') === '1'
  const casistiche = await db.casistaReclamo.findMany({
    where: soloAttive ? { attiva: true } : undefined,
    orderBy: [{ attiva: 'desc' }, { nome: 'asc' }],
  })
  return NextResponse.json({ casistiche })
}

export async function POST(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const c = (await req.json().catch(() => ({}))) as {
    id?: string
    nome?: string
    descrizione?: string
    colpaTipica?: string
    gravita?: number
    azioni?: string
    attiva?: boolean
  }
  const nome = (c.nome ?? '').trim()
  if (!nome) return NextResponse.json({ errore: 'Serve il nome della casistica.' }, { status: 400 })

  const gravita = gravitaValida(Number(c.gravita)) ? Number(c.gravita) : 2
  const dati = {
    nome,
    descrizione: (c.descrizione ?? '').trim(),
    colpaTipica: (c.colpaTipica ?? '').trim(),
    gravita,
    azioni: (c.azioni ?? '').trim(),
    ...(c.attiva === undefined ? {} : { attiva: c.attiva }),
  }

  const casistica = c.id
    ? await db.casistaReclamo.update({ where: { id: c.id }, data: dati })
    : await db.casistaReclamo.create({ data: dati })
  return NextResponse.json({ casistica })
}

export async function DELETE(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Serve l’id.' }, { status: 400 })
  await db.casistaReclamo.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

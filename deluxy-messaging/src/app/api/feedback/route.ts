import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { colpaGiudicabile } from '@/lib/reclami'

export const dynamic = 'force-dynamic'

const ORIGINI = ['telefono', 'whatsapp', 'email', 'reclamo', 'altro']

// I feedback ricevuti su un valet o su un partner: il voto di una persona.
// Reggono la voce "Feedback" della pagella.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const tipo = (p.get('tipo') ?? '').trim()
  const soggettoId = (p.get('soggettoId') ?? '').trim()
  const q = (p.get('q') ?? '').trim()

  const dove: Prisma.FeedbackWhereInput = {}
  if (tipo) dove.soggettoTipo = tipo
  if (soggettoId) dove.soggettoId = soggettoId
  if (q) {
    const testo: Prisma.StringFilter = { contains: q, mode: 'insensitive' }
    dove.OR = [{ soggettoNome: testo }, { clienteNome: testo }, { testo: testo }, { ordineNumero: testo }]
  }

  const [feedback, totale] = await Promise.all([
    db.feedback.findMany({ where: dove, orderBy: { creatoIl: 'desc' }, take: 300 }),
    db.feedback.count({ where: dove }),
  ])
  return NextResponse.json({ feedback, totale })
}

export async function POST(req: NextRequest) {
  const c = (await req.json().catch(() => ({}))) as {
    id?: string
    soggettoTipo?: string
    soggettoId?: string
    soggettoNome?: string
    voto?: number
    testo?: string
    clienteNome?: string
    ordineNumero?: string
    origine?: string
  }

  const soggettoTipo = (c.soggettoTipo ?? '').trim()
  const soggettoId = (c.soggettoId ?? '').trim()
  // Un feedback senza un soggetto identificato non serve a nessuna pagella.
  if (!colpaGiudicabile(soggettoTipo) || !soggettoId) {
    return NextResponse.json(
      { errore: 'Scegli il valet o il partner a cui si riferisce il feedback.' },
      { status: 400 }
    )
  }

  const votoGrezzo = Number(c.voto)
  if (!Number.isFinite(votoGrezzo) || votoGrezzo < 1 || votoGrezzo > 5) {
    return NextResponse.json({ errore: 'Il voto va da 1 a 5.' }, { status: 400 })
  }

  const origine = (c.origine ?? '').trim()
  const dati = {
    soggettoTipo,
    soggettoId,
    soggettoNome: (c.soggettoNome ?? '').trim(),
    voto: Math.round(votoGrezzo),
    testo: (c.testo ?? '').trim(),
    clienteNome: (c.clienteNome ?? '').trim(),
    ordineNumero: (c.ordineNumero ?? '').trim(),
    origine: ORIGINI.includes(origine) ? origine : 'altro',
  }

  const feedback = c.id
    ? await db.feedback.update({ where: { id: c.id }, data: dati })
    : await db.feedback.create({ data: dati })
  return NextResponse.json({ feedback })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Serve l’id.' }, { status: 400 })
  await db.feedback.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

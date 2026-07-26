import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// I valet: chi fa le consegne. Registro locale (non esiste altrove), serve a
// imputare la colpa di un reclamo a una persona e a darle un giudizio.
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const soloAttivi = req.nextUrl.searchParams.get('attivi') === '1'
  const valet = await db.valet.findMany({
    where: {
      ...(soloAttivi ? { attivo: true } : {}),
      ...(q
        ? {
            OR: [
              { nome: { contains: q, mode: 'insensitive' } },
              { telefono: { contains: q } },
              { zona: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ attivo: 'desc' }, { nome: 'asc' }],
  })
  return NextResponse.json({ valet })
}

export async function POST(req: NextRequest) {
  const c = (await req.json().catch(() => ({}))) as {
    id?: string
    nome?: string
    telefono?: string
    email?: string
    zona?: string
    note?: string
    attivo?: boolean
  }
  const nome = (c.nome ?? '').trim()
  if (!nome) return NextResponse.json({ errore: 'Serve il nome del valet.' }, { status: 400 })

  const dati = {
    nome,
    telefono: (c.telefono ?? '').trim(),
    email: (c.email ?? '').trim(),
    zona: (c.zona ?? '').trim(),
    note: (c.note ?? '').trim(),
    ...(c.attivo === undefined ? {} : { attivo: c.attivo }),
  }

  const valet = c.id
    ? await db.valet.update({ where: { id: c.id }, data: dati })
    : await db.valet.create({ data: dati })
  return NextResponse.json({ valet })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Serve l’id.' }, { status: 400 })
  await db.valet.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

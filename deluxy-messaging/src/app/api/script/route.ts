import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Gli script: le risposte pronte da dare ai clienti.
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const script = await db.script.findMany({
    where: q
      ? {
          OR: [
            { titolo: { contains: q, mode: 'insensitive' } },
            { testo: { contains: q, mode: 'insensitive' } },
            { categoria: { contains: q, mode: 'insensitive' } },
            { quando: { contains: q, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: [{ categoria: 'asc' }, { usi: 'desc' }, { titolo: 'asc' }],
  })
  return NextResponse.json({ script })
}

export async function POST(req: NextRequest) {
  const c = (await req.json().catch(() => ({}))) as {
    id?: string
    titolo?: string
    categoria?: string
    testo?: string
    quando?: string
    attivo?: boolean
  }
  const titolo = (c.titolo ?? '').trim()
  const testo = (c.testo ?? '').trim()
  if (!titolo || !testo) {
    return NextResponse.json({ errore: 'Servono un titolo e il testo della risposta.' }, { status: 400 })
  }

  const dati = {
    titolo,
    categoria: (c.categoria ?? '').trim() || 'Generale',
    testo,
    quando: (c.quando ?? '').trim(),
    ...(c.attivo === undefined ? {} : { attivo: c.attivo }),
  }

  const script = c.id
    ? await db.script.update({ where: { id: c.id }, data: dati })
    : await db.script.create({ data: dati })
  return NextResponse.json({ script })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Serve l’id.' }, { status: 400 })
  await db.script.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

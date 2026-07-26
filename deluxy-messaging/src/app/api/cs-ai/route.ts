import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ambitoValido } from '@/lib/cs-ai'

export const dynamic = 'force-dynamic'

// Le istruzioni con cui l'AI parla ai clienti: tono, firma, cosa non promettere.
// I paletti di sicurezza NON stanno qui — sono nel codice (src/lib/cs-ai.ts) e
// non si possono cancellare da questa rotta.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const q = (p.get('q') ?? '').trim()
  const ambito = (p.get('ambito') ?? '').trim()

  const dove: Prisma.IstruzioneAIWhereInput = {}
  if (ambito) dove.ambito = ambito
  if (q) {
    const testo: Prisma.StringFilter = { contains: q, mode: 'insensitive' }
    dove.OR = [{ titolo: testo }, { testo }, { categoria: testo }]
  }

  const istruzioni = await db.istruzioneAI.findMany({
    where: dove,
    orderBy: [{ attiva: 'desc' }, { ordine: 'asc' }, { categoria: 'asc' }, { titolo: 'asc' }],
  })
  return NextResponse.json({ istruzioni })
}

export async function POST(req: NextRequest) {
  const c = (await req.json().catch(() => ({}))) as {
    id?: string
    titolo?: string
    categoria?: string
    testo?: string
    ambito?: string
    ordine?: number
    attiva?: boolean
  }

  const titolo = (c.titolo ?? '').trim()
  const testo = (c.testo ?? '').trim()
  if (!titolo) return NextResponse.json({ errore: 'Serve un titolo.' }, { status: 400 })
  if (!testo) {
    return NextResponse.json(
      { errore: 'Serve il testo dell’istruzione: è quello che legge l’AI.' },
      { status: 400 }
    )
  }

  const dati = {
    titolo,
    categoria: (c.categoria ?? '').trim() || 'Generale',
    testo,
    ambito: ambitoValido((c.ambito ?? '').trim()) ? (c.ambito as string).trim() : 'tutti',
    ordine: Number.isFinite(Number(c.ordine)) ? Math.round(Number(c.ordine)) : 0,
    ...(c.attiva === undefined ? {} : { attiva: c.attiva }),
  }

  const istruzione = c.id
    ? await db.istruzioneAI.update({ where: { id: c.id }, data: dati })
    : await db.istruzioneAI.create({ data: dati })
  return NextResponse.json({ istruzione })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ errore: 'Serve l’id.' }, { status: 400 })
  await db.istruzioneAI.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

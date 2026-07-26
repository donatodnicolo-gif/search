import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { colpaGiudicabile } from '@/lib/reclami'

export const dynamic = 'force-dynamic'

// Il valore di una voce MANUALE per un soggetto: la "variabile impostabile".
// 0-100. Uno per (voce, soggetto): si aggiorna, non si accumula.
export async function POST(req: NextRequest) {
  const c = (await req.json().catch(() => ({}))) as {
    voceId?: string
    soggettoTipo?: string
    soggettoId?: string
    valore?: number
    nota?: string
  }

  const voceId = (c.voceId ?? '').trim()
  const soggettoTipo = (c.soggettoTipo ?? '').trim()
  const soggettoId = (c.soggettoId ?? '').trim()
  if (!voceId || !colpaGiudicabile(soggettoTipo) || !soggettoId) {
    return NextResponse.json({ errore: 'Voce o soggetto non validi.' }, { status: 400 })
  }

  // La voce deve esistere ed essere davvero manuale: scrivere un valore a mano
  // su una voce calcolata (reclami, feedback, puntualità) darebbe un numero che
  // non verrebbe mai letto — meglio dirlo subito.
  const voce = await db.vocePunteggio.findUnique({ where: { id: voceId } })
  if (!voce) return NextResponse.json({ errore: 'Voce non trovata.' }, { status: 404 })
  if (voce.fonte !== 'manuale') {
    return NextResponse.json(
      { errore: `«${voce.nome}» si calcola da sola (${voce.fonte}): non si imposta a mano.` },
      { status: 400 }
    )
  }

  const grezzo = Number(c.valore)
  if (!Number.isFinite(grezzo)) {
    return NextResponse.json({ errore: 'Serve un valore da 0 a 100.' }, { status: 400 })
  }
  const valore = Math.max(0, Math.min(100, grezzo))
  const nota = (c.nota ?? '').trim()

  const metrica = await db.metricaManuale.upsert({
    where: { voceId_soggettoTipo_soggettoId: { voceId, soggettoTipo, soggettoId } },
    create: { voceId, soggettoTipo, soggettoId, valore, nota },
    update: { valore, nota },
  })
  return NextResponse.json({ metrica })
}

// Toglie il valore: la voce torna "nessun dato" e viene esclusa dalla media,
// che è diverso da metterla a zero.
export async function DELETE(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const voceId = (p.get('voceId') ?? '').trim()
  const soggettoTipo = (p.get('soggettoTipo') ?? '').trim()
  const soggettoId = (p.get('soggettoId') ?? '').trim()
  if (!voceId || !soggettoTipo || !soggettoId) {
    return NextResponse.json({ errore: 'Servono voce e soggetto.' }, { status: 400 })
  }
  await db.metricaManuale.deleteMany({ where: { voceId, soggettoTipo, soggettoId } })
  return NextResponse.json({ ok: true })
}

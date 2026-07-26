import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { statoReclamoValido, reclamoAperto } from '@/lib/reclami'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Cambia rapidamente lo stato di un reclamo (aperto → in lavorazione → risolto →
// chiuso), senza riaprire tutta la scheda.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { stato } = (await req.json().catch(() => ({}))) as { stato?: string }
  if (!stato || !statoReclamoValido(stato)) {
    return NextResponse.json({ errore: 'Stato del reclamo non valido.' }, { status: 400 })
  }
  const esistente = await db.reclamo.findUnique({ where: { id } })
  if (!esistente) return NextResponse.json({ errore: 'Reclamo non trovato' }, { status: 404 })

  const reclamo = await db.reclamo.update({
    where: { id },
    data: { stato, risoltoIl: reclamoAperto(stato) ? null : esistente.risoltoIl ?? new Date() },
  })
  return NextResponse.json({ reclamo })
}

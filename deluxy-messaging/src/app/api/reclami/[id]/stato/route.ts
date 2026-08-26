import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { statoReclamoValido, reclamoAperto } from '@/lib/reclami'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Cambia rapidamente lo stato di un reclamo (aperto → in lavorazione → risolto →
// chiuso), senza riaprire tutta la scheda.
export async function POST(req: NextRequest, { params }: Params) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
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

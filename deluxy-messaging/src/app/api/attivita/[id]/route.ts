import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Spuntare (o ri-aprire) un promemoria.
export async function PATCH(req: NextRequest, { params }: Params) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const { fatta } = (await req.json().catch(() => ({}))) as { fatta?: boolean }
  const esiste = await db.attivita.findUnique({ where: { id }, select: { id: true } })
  if (!esiste) return NextResponse.json({ errore: 'Promemoria non trovato' }, { status: 404 })

  const spuntata = fatta !== false
  const attivita = await db.attivita.update({
    where: { id },
    // `fattaIl` si azzera riaprendo: altrimenti resterebbe la data di quando
    // era stata spuntata e l'elenco delle fatte la riordinerebbe a caso.
    data: { fatta: spuntata, fattaIl: spuntata ? new Date() : null },
  })
  return NextResponse.json({ attivita })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const esiste = await db.attivita.findUnique({ where: { id }, select: { id: true } })
  if (!esiste) return NextResponse.json({ errore: 'Promemoria non trovato' }, { status: 404 })
  await db.attivita.delete({ where: { id } })
  return NextResponse.json({ eliminato: true })
}

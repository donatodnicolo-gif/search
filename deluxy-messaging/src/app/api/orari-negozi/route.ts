import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { azzeraOrario, orariDeiNegozi, salvaOrario } from '@/lib/orari-negozi'
import { validaOrario } from '@/lib/orari-regole'

export const dynamic = 'force-dynamic'

// ⭐ ORARI NEGOZI (10/09/2026, richiesta dell'utente): giorni di apertura, fasce
// orarie di consegna e giorni di chiusura di ogni negozio Shopify.
//
// Lettura per tutti gli operatori (il modulo Nuovo ordine ne ha bisogno per
// dire se una data si può scegliere); scrittura per l'amministratore. Il
// cancello sta QUI, non nel menu: una rotta è un endpoint anche senza voce.
async function admin() {
  const io = await utenteCorrente()
  if (!io) return { errore: NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 }) }
  if (io.ruolo !== 'admin') return { errore: NextResponse.json({ errore: 'Serve un amministratore.' }, { status: 403 }) }
  return { io }
}

export async function GET() {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  return NextResponse.json({ negozi: await orariDeiNegozi() })
}

// PUT { negozioId, giorniApertura: number[], regole, giorniChiusura: [{data,motivo,ogniAnno}], giorniSpeciali: [{data,ogniAnno,fasce:[{da,a}]}], nota }
// Gli errori tornano a parole, tutti insieme: l'operatore li corregge in un giro solo.
export async function PUT(req: NextRequest) {
  const g = await admin()
  if ('errore' in g) return g.errore
  const body = (await req.json().catch(() => null)) as { negozioId?: string } | null
  const negozioId = String(body?.negozioId ?? '').trim()
  if (!negozioId) return NextResponse.json({ errore: 'Manca il negozio.' }, { status: 400 })
  const negozio = await db.negozioShopify.findUnique({ where: { id: negozioId }, select: { id: true } })
  if (!negozio) return NextResponse.json({ errore: 'Negozio non trovato.' }, { status: 404 })
  const esito = validaOrario(body)
  if (!esito.ok) return NextResponse.json({ errore: esito.errori[0], errori: esito.errori }, { status: 400 })
  const riga = await salvaOrario(negozioId, esito.dati, g.io.nome ?? null)
  return NextResponse.json({ ok: true, aggiornatoIl: riga.aggiornatoIl, modificatoDa: riga.modificatoDa })
}

// DELETE ?negozio=<id> — torna al predefinito.
export async function DELETE(req: NextRequest) {
  const g = await admin()
  if ('errore' in g) return g.errore
  const negozioId = (req.nextUrl.searchParams.get('negozio') ?? '').trim()
  if (!negozioId) return NextResponse.json({ errore: 'Manca il negozio.' }, { status: 400 })
  await azzeraOrario(negozioId)
  return NextResponse.json({ ok: true })
}

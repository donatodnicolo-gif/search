import { NextRequest, NextResponse } from 'next/server'
import { dettaglioOrdineLocale } from '@/lib/dettaglio-ordine'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Il dettaglio di un ordine che abbiamo in casa. La costruzione sta in
// `src/lib/dettaglio-ordine.ts`, perché la stessa forma la serve anche
// l'archivio storico (ordini che vivono solo nel registro Ordini).
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const dati = await dettaglioOrdineLocale(id)
  if (!dati) return NextResponse.json({ errore: 'Ordine non trovato' }, { status: 404 })
  return NextResponse.json(dati)
}

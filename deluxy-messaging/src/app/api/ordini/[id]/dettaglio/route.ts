import { NextRequest, NextResponse } from 'next/server'
import { dettaglioOrdineLocale } from '@/lib/dettaglio-ordine'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Il dettaglio di un ordine che abbiamo in casa. La costruzione sta in
// `src/lib/dettaglio-ordine.ts`, perché la stessa forma la serve anche
// l'archivio storico (ordini che vivono solo nel registro Ordini).
export async function GET(_req: NextRequest, { params }: Params) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const dati = await dettaglioOrdineLocale(id)
  if (!dati) return NextResponse.json({ errore: 'Ordine non trovato' }, { status: 404 })
  return NextResponse.json(dati)
}

import { NextRequest, NextResponse } from 'next/server'
import { cercaInArchivio } from '@/lib/orders'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Cerca negli ordini storici (app Deluxy Orders): serve per gli ordini più
// vecchi dei 60 giorni scaricati da Shopify.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (!q) return NextResponse.json({ stato: 'ok', totale: 0, ordini: [] })
  return NextResponse.json(await cercaInArchivio(q))
}

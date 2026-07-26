import { NextRequest, NextResponse } from 'next/server'
import { cercaInArchivio } from '@/lib/orders'

export const dynamic = 'force-dynamic'

// Cerca negli ordini storici (app Deluxy Orders): serve per gli ordini più
// vecchi dei 60 giorni scaricati da Shopify.
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (!q) return NextResponse.json({ stato: 'ok', totale: 0, ordini: [] })
  return NextResponse.json(await cercaInArchivio(q))
}

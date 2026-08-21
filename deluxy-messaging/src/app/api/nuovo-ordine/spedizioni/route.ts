import { NextRequest, NextResponse } from 'next/server'
import { spedizioniDelNegozio } from '@/lib/nuovo-ordine'

export const dynamic = 'force-dynamic'

// Le voci di spedizione che QUEL negozio usa davvero (dai suoi ordini recenti).
export async function GET(req: NextRequest) {
  const negozio = (req.nextUrl.searchParams.get('negozio') ?? '').trim()
  if (!negozio) return NextResponse.json({ spedizioni: [] })
  try {
    return NextResponse.json({ spedizioni: await spedizioniDelNegozio(negozio) })
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 502 })
  }
}

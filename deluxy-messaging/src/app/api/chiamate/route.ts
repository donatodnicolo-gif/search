import { NextRequest, NextResponse } from 'next/server'
import { elencoChiamate } from '@/lib/chiamate'

export const dynamic = 'force-dynamic'

// Le telefonate ricevute, con quante restano da richiamare per marchio.
//
// Parametri: `giorni` (default 30), `aperte=1` (solo quelle da richiamare),
// `negozio` (id del marchio).
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const giorni = Math.min(365, Math.max(1, Number(p.get('giorni') ?? '30') || 30))
  const esito = await elencoChiamate({
    giorni,
    soloDaRichiamare: p.get('aperte') === '1',
    negozioId: p.get('negozio')?.trim() || undefined,
  })
  return NextResponse.json(esito)
}

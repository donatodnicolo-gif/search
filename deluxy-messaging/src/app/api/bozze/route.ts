import { NextRequest, NextResponse } from 'next/server'
import { elencoBozze } from '@/lib/bozze'

export const dynamic = 'force-dynamic'
// Una domanda a Shopify per negozio: i 10 secondi di default non bastano.
export const maxDuration = 60

// Le bozze mandate col link di pagamento, con lo stato CHIESTO a Shopify:
// pagate (e con che numero d'ordine) o ancora in giro.
export async function GET(req: NextRequest) {
  const giorni = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get('giorni') ?? '60') || 60))
  const annullate = req.nextUrl.searchParams.get('annullate') === '1'
  return NextResponse.json(await elencoBozze(giorni, { annullate }))
}

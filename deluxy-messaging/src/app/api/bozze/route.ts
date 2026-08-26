import { NextRequest, NextResponse } from 'next/server'
import { elencoBozze } from '@/lib/bozze'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
// Una domanda a Shopify per negozio: i 10 secondi di default non bastano.
export const maxDuration = 60

// Le bozze mandate col link di pagamento, con lo stato CHIESTO a Shopify:
// pagate (e con che numero d'ordine) o ancora in giro.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const giorni = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get('giorni') ?? '60') || 60))
  const annullate = req.nextUrl.searchParams.get('annullate') === '1'
  return NextResponse.json(await elencoBozze(giorni, { annullate }))
}

import { NextRequest, NextResponse } from 'next/server'
import { elencoChiamate } from '@/lib/chiamate'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Le telefonate ricevute, con quante restano da richiamare per marchio.
//
// Parametri: `giorni` (default 30), `aperte=1` (solo quelle da richiamare),
// `negozio` (id del marchio).
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const giorni = Math.min(365, Math.max(1, Number(p.get('giorni') ?? '30') || 30))
  const esito = await elencoChiamate({
    giorni,
    soloDaRichiamare: p.get('aperte') === '1',
    negozioId: p.get('negozio')?.trim() || undefined,
  })
  return NextResponse.json(esito)
}

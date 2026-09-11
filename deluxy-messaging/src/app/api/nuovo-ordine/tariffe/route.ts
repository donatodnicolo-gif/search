import { NextRequest, NextResponse } from 'next/server'
import { tariffeConStima, type RichiestaTariffe } from '@/lib/tariffe-con-stima'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
// Una chiamata a Shopify per calcolare la spedizione: i 10 secondi sono stretti.
export const maxDuration = 30

// Le tariffe di consegna che Shopify offre per questo carrello e questo
// indirizzo — calcolate dal sito, non scritte a mano.
//
// ⚠️ POST e non GET: servono l'indirizzo e le righe dell'ordine, e la tariffa
// dipende da tutti e due (certe zone sono gratis oltre una soglia di spesa).
export async function POST(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora.
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })

  const c = (await req.json().catch(() => ({}))) as RichiestaTariffe
  // Il conto (tariffe del sito + stima fuori zona) sta in src/lib/tariffe-con-stima.ts:
  // lo stesso che risponde alle altre app da /api/v1/nuovo-ordine/tariffe (11/09/2026).
  const r = await tariffeConStima(c)
  return NextResponse.json(r.corpo, { status: r.status })
}

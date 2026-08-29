import { NextRequest, NextResponse } from 'next/server'
import { tariffeConsegna } from '@/lib/nuovo-ordine'
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

  const c = (await req.json().catch(() => ({}))) as {
    negozioId?: string
    indirizzo?: { citta?: string; cap?: string; provincia?: string; paese?: string }
    righe?: { variantId?: string; titolo?: string; prezzo?: number; quantita?: number }[]
  }
  const negozioId = (c.negozioId ?? '').trim()
  if (!negozioId) return NextResponse.json({ tariffe: [] })

  const esito = await tariffeConsegna(
    negozioId,
    {
      citta: c.indirizzo?.citta ?? '',
      cap: c.indirizzo?.cap ?? '',
      provincia: c.indirizzo?.provincia ?? '',
      paese: c.indirizzo?.paese ?? 'IT',
    },
    (c.righe ?? []).map((r) => ({
      variantId: r.variantId,
      titolo: r.titolo,
      prezzo: r.prezzo,
      quantita: Math.max(1, r.quantita ?? 1),
    }))
  )
  if (esito.stato === 'errore') {
    return NextResponse.json({ errore: esito.messaggio }, { status: 502 })
  }
  if (esito.stato === 'senza-negozio') {
    return NextResponse.json({ errore: 'Negozio non trovato.' }, { status: 400 })
  }
  return NextResponse.json({ tariffe: esito.tariffe })
}

import { NextRequest, NextResponse } from 'next/server'
import { metodiPagamentoDelNegozio } from '@/lib/nuovo-ordine'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
// Una domanda a Shopify: i 10 secondi di default sono stretti.
export const maxDuration = 30

// I metodi di pagamento che QUEL negozio usa davvero (dai suoi ordini recenti).
//
// ⚠️ Perché non si chiedono a Shopify in elenco: non esiste una query che li
// dia (provato sull'API 2024-10, vedi `metodiPagamentoDelNegozio`). L'unico
// posto dove sono scritti sono gli ordini.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const negozio = (req.nextUrl.searchParams.get('negozio') ?? '').trim()
  if (!negozio) return NextResponse.json({ metodi: [] })
  try {
    return NextResponse.json({ metodi: await metodiPagamentoDelNegozio(negozio) })
  } catch (e) {
    // ⚠️ L'errore si dice: senza, la tendina ricadrebbe sulla lista di riserva
    // e nessuno saprebbe che i nomi veri non sono arrivati.
    return NextResponse.json({ errore: (e as Error).message }, { status: 502 })
  }
}

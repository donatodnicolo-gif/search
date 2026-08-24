import { NextRequest, NextResponse } from 'next/server'
import { utenteCorrente } from '@/lib/sessione'
import { dettaglioMaps } from '@/lib/maps-fornitori'

export const dynamic = 'force-dynamic'

// Telefono, sito e indirizzo di UN luogo di Google Maps: quello che è stato
// scelto dall'elenco.
//
// ⚠️⚠️ Perché una rotta a parte invece di mettere il telefono già nell'elenco:
// la ricerca di testo non lo restituisce, servirebbe una chiamata di dettaglio
// **per ogni risultato** — venti chiamate a pagamento per riempirne una. Così
// se ne fa una sola, e solo quando serve davvero.
//
// ⚠️ La chiave resta nel server: il browser parla solo con questa rotta. Una
// chiave Maps esposta in pagina la usa chiunque, e la paga Deluxy.
export async function GET(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  const id = (req.nextUrl.searchParams.get('id') ?? '').trim()
  if (!id) return NextResponse.json({ errore: 'Manca il luogo.' }, { status: 400 })

  const e = await dettaglioMaps(id)
  if (e.stato !== 'ok') {
    // ⚠️ Il motivo si dice: chi ha premuto deve sapere se riprovare o scrivere
    // il numero a mano, e «non riuscito» non gli dice quale delle due.
    return NextResponse.json({ errore: e.messaggio }, { status: 502 })
  }
  return NextResponse.json({ luogo: e.luogo })
}

import { NextRequest, NextResponse } from 'next/server'
import { dettaglioIndirizzo, suggerisciIndirizzi } from '@/lib/indirizzi'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Indirizzi da Google Maps: `?q=` suggerisce, `?id=` dà i campi separati.
//
// ⚠️ La chiave resta nel server: il browser parla solo con questa rotta, che
// sta dietro la sessione. Una chiave Maps in pagina la usa chiunque e la paga
// Deluxy.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const id = (p.get('id') ?? '').trim()
  if (id) {
    const scelto = await dettaglioIndirizzo(id)
    if (!scelto) return NextResponse.json({ errore: 'Indirizzo non leggibile.' }, { status: 502 })
    return NextResponse.json({ indirizzo: scelto })
  }
  const esito = await suggerisciIndirizzi(p.get('q') ?? '')
  if (esito.stato === 'senza-chiave') {
    // ⚠️ 200 e non errore: non è un guasto, è una chiave che manca. La
    // schermata deve poter dire «scrivilo a mano» invece di sembrare rotta.
    return NextResponse.json({
      suggerimenti: [],
      senzaChiave: true,
      nota: 'Manca la chiave Google Maps (Impostazioni → Indirizzi): scrivi l’indirizzo a mano.',
    })
  }
  if (esito.stato === 'errore') return NextResponse.json({ errore: esito.messaggio }, { status: 502 })
  return NextResponse.json({ suggerimenti: esito.suggerimenti })
}

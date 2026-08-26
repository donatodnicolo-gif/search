import { NextRequest, NextResponse } from 'next/server'
import { cercaProdotti } from '@/lib/nuovo-ordine'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// I prodotti di un negozio, per comporre un ordine nuovo.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const negozio = (p.get('negozio') ?? '').trim()
  if (!negozio) return NextResponse.json({ errore: 'Scegli prima il negozio.' }, { status: 400 })
  const esito = await cercaProdotti(negozio, (p.get('q') ?? '').trim())
  if (esito.stato === 'senza-permesso') {
    // ⚠️ 200 e non un errore: non è un guasto, è un permesso che manca. La
    // schermata deve poter dire «scrivi la riga a mano» invece di sembrare rotta.
    return NextResponse.json({
      prodotti: [],
      senzaPermesso: true,
      nota: 'L’app non ha il permesso di leggere il catalogo (read_products): scrivi la riga a mano, oppure aggiungi il permesso all’app CRM_DELUXY.',
    })
  }
  if (esito.stato === 'errore') return NextResponse.json({ errore: esito.messaggio }, { status: 502 })
  return NextResponse.json({ prodotti: esito.prodotti })
}

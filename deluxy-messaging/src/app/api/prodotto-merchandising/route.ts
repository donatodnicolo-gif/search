import { NextRequest, NextResponse } from 'next/server'
import { prodottoDaMerchandising } from '@/lib/merchandising'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// La scheda di un prodotto, presa da Merchandising.
//
// ⚠️ Passa di qui e non dal browser perché la chiave di Merchandising non deve
// mai uscire dal server: stessa regola di /api/fornitori-zona e /api/partner.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Come nelle altre rotte: il middleware controlla la FIRMA del
  // cookie, non che l'utente esista ancora.
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const sku = (p.get('sku') ?? '').trim()
  const titolo = (p.get('titolo') ?? '').trim()
  if (!sku && !titolo) {
    return NextResponse.json({ errore: 'Serve almeno lo SKU o il titolo del prodotto.' }, { status: 400 })
  }

  const esito = await prodottoDaMerchandising(sku, titolo)
  return NextResponse.json(esito)
}

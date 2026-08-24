import { NextRequest, NextResponse } from 'next/server'
import { autentica, erroreApi } from '@/lib/api-auth'
import { cercaProdotti } from '@/lib/nuovo-ordine'

export const dynamic = 'force-dynamic'

// GET /api/v1/nuovo-ordine/prodotti?negozio=<id>&q=<testo> — i prodotti del
// catalogo di QUEL negozio che corrispondono alla ricerca.
//
// ⚠️ `stato: "senza-permesso"` NON è una lista vuota: vuol dire che il token
// del negozio non ha `read_products`. Chi chiama deve mostrare la riga a mano
// (titolo + prezzo), non «nessun prodotto trovato».
export async function GET(req: NextRequest) {
  const client = await autentica(req)
  if (client instanceof NextResponse) return client

  const p = req.nextUrl.searchParams
  const negozio = p.get('negozio')?.trim()
  const q = p.get('q')?.trim()
  if (!negozio) return erroreApi(400, 'Manca ?negozio=<id>')
  if (!q) return erroreApi(400, 'Manca ?q=<testo da cercare>')

  const esito = await cercaProdotti(negozio, q)
  return NextResponse.json(esito, { headers: { 'Cache-Control': 'no-store' } })
}

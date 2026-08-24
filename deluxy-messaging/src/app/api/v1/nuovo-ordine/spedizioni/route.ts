import { NextRequest, NextResponse } from 'next/server'
import { autentica, erroreApi } from '@/lib/api-auth'
import { spedizioniDelNegozio } from '@/lib/nuovo-ordine'

export const dynamic = 'force-dynamic'

// GET /api/v1/nuovo-ordine/spedizioni?negozio=<id> — le voci di spedizione che
// QUEL negozio usa davvero (lette dai suoi ordini recenti, le più usate prima).
// Non si inventano e non si condividono fra i marchi: «Consegna Deluxy» su un
// ordine Cake sarebbe un servizio che quel marchio non fa.
export async function GET(req: NextRequest) {
  const client = await autentica(req)
  if (client instanceof NextResponse) return client

  const negozio = req.nextUrl.searchParams.get('negozio')?.trim()
  if (!negozio) return erroreApi(400, 'Manca ?negozio=<id>')

  const spedizioni = await spedizioniDelNegozio(negozio)
  return NextResponse.json({ spedizioni }, { headers: { 'Cache-Control': 'no-store' } })
}

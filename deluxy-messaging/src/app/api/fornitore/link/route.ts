import { NextRequest, NextResponse } from 'next/server'
import { linkFornitore } from '@/lib/fornitori'

export const dynamic = 'force-dynamic'

// Link di accesso all'app Ricerca fornitori per un ordine. La chiave dlxs_…
// resta sul server: il browser riceve solo l'URL già pronto.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const brand = (p.get('brand') ?? '').trim()
  const ordine = (p.get('ordine') ?? '').trim()
  if (!brand || !ordine) {
    return NextResponse.json({ errore: 'Servono brand e ordine.' }, { status: 400 })
  }
  return NextResponse.json(await linkFornitore(brand, ordine))
}

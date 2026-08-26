import { NextRequest, NextResponse } from 'next/server'
import { spedizioniDelNegozio } from '@/lib/nuovo-ordine'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Le voci di spedizione che QUEL negozio usa davvero (dai suoi ordini recenti).
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const negozio = (req.nextUrl.searchParams.get('negozio') ?? '').trim()
  if (!negozio) return NextResponse.json({ spedizioni: [] })
  try {
    return NextResponse.json({ spedizioni: await spedizioniDelNegozio(negozio) })
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 502 })
  }
}

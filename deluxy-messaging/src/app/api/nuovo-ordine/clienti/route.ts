import { NextRequest, NextResponse } from 'next/server'
import { cercaClienti } from '@/lib/nuovo-ordine'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// I clienti già registrati nel negozio, per riempire l'ordine senza ridigitare.
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const negozio = (p.get('negozio') ?? '').trim()
  const q = (p.get('q') ?? '').trim()
  if (!negozio) return NextResponse.json({ errore: 'Scegli prima il negozio.' }, { status: 400 })
  if (!q) return NextResponse.json({ clienti: [] })
  try {
    return NextResponse.json({ clienti: await cercaClienti(negozio, q) })
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 502 })
  }
}

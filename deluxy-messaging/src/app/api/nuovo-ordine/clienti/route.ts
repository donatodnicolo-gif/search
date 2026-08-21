import { NextRequest, NextResponse } from 'next/server'
import { cercaClienti } from '@/lib/nuovo-ordine'

export const dynamic = 'force-dynamic'

// I clienti già registrati nel negozio, per riempire l'ordine senza ridigitare.
export async function GET(req: NextRequest) {
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

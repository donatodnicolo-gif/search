import { NextRequest, NextResponse } from 'next/server'
import { siglaProvincia } from '@/lib/province'
import { utenteCorrente } from '@/lib/sessione'
import { scontoPerProvincia, statoProvincia } from '@/lib/vendite'

export const dynamic = 'force-dynamic'

// Lo STATO DEI PARTNER in una provincia (Vendite → Partner per provincia):
// chi vende lì, con che mestiere, chi consegna da solo e dove, le liste della
// provincia, le aree commerciali che la contengono — letto dalla piattaforma
// consegne (dieci minuti di cache; `?fresco=1` per rileggere) e lo sconto che
// ne deriva.
export async function GET(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })
  const sigla = siglaProvincia(req.nextUrl.searchParams.get('provincia') ?? '')
  if (!sigla) return NextResponse.json({ errore: 'Provincia non riconosciuta.' }, { status: 400 })
  const stato = await statoProvincia(sigla, req.nextUrl.searchParams.get('fresco') === '1')
  if (!stato) return NextResponse.json({ errore: 'La piattaforma consegne non ha risposto (chiave in Impostazioni?).' }, { status: 502 })
  const sconto = await scontoPerProvincia(sigla, stato.conPartner)
  return NextResponse.json({ ...stato, sconto })
}

import { NextRequest, NextResponse } from 'next/server'
import { utenteCorrente } from '@/lib/sessione'
import { novitaDa } from '@/lib/novita'

export const dynamic = 'force-dynamic'

// ── COSA È SUCCESSO DA QUANDO GUARDAVO L'ULTIMA VOLTA ──
//
// Il lavoro vero sta in `src/lib/novita.ts`, che si può provare senza passare
// dal login. Qui restano le tre cose che riguardano la richiesta: chi sei, da
// quando, e come si risponde.
export async function GET(req: NextRequest) {
  // ⚠️ Dietro al login come tutto il resto: le novità raccontano nomi di clienti
  // e cifre. 401 e basta — il client, vedendolo, smette di chiedere invece di
  // riprovare ogni mezzo minuto contro una porta chiusa.
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })

  const grezzo = (req.nextUrl.searchParams.get('da') ?? '').trim()
  const da = grezzo ? new Date(grezzo) : null

  return NextResponse.json(await novitaDa(da, io.nome))
}

import { NextRequest, NextResponse } from 'next/server'
import { sincronizzaChargeback } from '@/lib/chargeback'

// Rilettura automatica delle contestazioni, una volta all'ora.
//
// ⚠️ Un'ora e non 15 minuti: una contestazione si apre e si chiude in giorni,
// non in minuti, e ogni giro sono tre chiamate a Shopify. Quello che conta è
// che nessuna resti invisibile fino alla scadenza.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET
  if (!segreto) {
    return NextResponse.json({ errore: 'CRON_SECRET non configurato.' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 })
  }
  try {
    const esito = await sincronizzaChargeback()
    return NextResponse.json({ ok: true, ...esito })
  } catch (e) {
    return NextResponse.json({ ok: false, errore: (e as Error).message }, { status: 502 })
  }
}

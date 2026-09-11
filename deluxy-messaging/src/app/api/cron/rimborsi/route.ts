import { NextRequest, NextResponse } from 'next/server'
import { chiudiRimborsiGiaResi } from '@/lib/rimborsi-gia-resi'

// Chiude le richieste di rimborso che su Shopify risultano già rese.
//
// ⚠️ Mezz'ora e non cinque minuti: un rimborso si fa una volta, e ogni giro è
// una chiamata a Shopify per richiesta aperta. Quello che conta è che una
// richiesta già pagata non resti in cima alla coda per giorni — come #12868,
// rimborsato il 3 settembre e ancora «da approvare» l'11.
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET
  if (!segreto) {
    return NextResponse.json({ errore: 'CRON_SECRET non configurato.' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 })
  }
  try {
    const esito = await chiudiRimborsiGiaResi()
    return NextResponse.json({ ok: true, ...esito })
  } catch (e) {
    return NextResponse.json({ ok: false, errore: (e as Error).message }, { status: 502 })
  }
}

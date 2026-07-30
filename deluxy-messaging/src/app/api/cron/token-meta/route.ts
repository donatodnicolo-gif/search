import { NextRequest, NextResponse } from 'next/server'
import { rinnovaTokenInstagram } from '@/lib/token-instagram'

// Rinnova i token Instagram prima che scadano, ogni notte.
//
// ⚠️ Il token dell'«Instagram API con login di Instagram» dura **60 giorni** e
// non si rinnova da sé: al sessantesimo giorno i direct smettono di arrivare e
// non lo dice nessuno. Meta lascia rinnovarlo, ma solo mentre è ancora valido —
// quindi non è un lavoro che si può fare «quando ci si accorge», va fatto prima.
//
// Se il token viene da un utente di sistema non scade e l'endpoint di rinnovo
// risponde con un errore: quell'errore si scrive e si mostra, non si ritenta
// ogni notte. Un rinnovo che non serve non è un guasto.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET
  if (!segreto) {
    return NextResponse.json(
      { errore: 'CRON_SECRET non configurato: il rinnovo automatico è disattivato.' },
      { status: 503 }
    )
  }
  if (req.headers.get('authorization') !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 })
  }

  try {
    return NextResponse.json({ ok: true, ...(await rinnovaTokenInstagram()) })
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 500 })
  }
}

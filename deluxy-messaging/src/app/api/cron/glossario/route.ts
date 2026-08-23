import { NextRequest, NextResponse } from 'next/server'
import { giroGlossario } from '@/lib/glossario-ai'

export const dynamic = 'force-dynamic'
// Legge fino a 40 conversazioni e fa una chiamata lunga al modello: il tetto
// alto serve, ma resta un giro al giorno.
export const maxDuration = 300

// Il giro giornaliero del glossario: l'AI legge le chat delle ultime 24 ore e
// PROPONE che cosa manca, che cosa è sbagliato, che cosa va detto all'operatore.
//
// ⚠️ Le proposte restano `aperte` finché una persona non decide: qui non si
// scrive niente nel glossario. Vedi `src/lib/glossario-ai.ts`.
export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET
  if (!segreto) {
    return NextResponse.json(
      { errore: 'CRON_SECRET non configurato: giro del glossario disattivato.' },
      { status: 503 }
    )
  }
  if (req.headers.get('authorization') !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 })
  }
  const esito = await giroGlossario()
  return NextResponse.json({ ok: !esito.errore, ...esito })
}

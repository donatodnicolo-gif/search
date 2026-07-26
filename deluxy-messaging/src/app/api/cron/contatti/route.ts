import { NextRequest, NextResponse } from 'next/server'
import { salvaContattiOrdini } from '@/lib/contatti'

// Salvataggio dei clienti in rubrica Google, una volta l'ora (cron Vercel).
//
// Sta per conto suo e non dentro il giro degli ordini perché è la parte LENTA:
// una chiamata alla People API per contatto, tetto di 40 per giro, misurati oltre
// 3 minuti. Se fosse attaccato al cron dei 15 minuti lo farebbe scadere, e si
// perderebbero gli ordini — che è esattamente ciò che quel cron deve evitare.
//
// Se Google non è collegato la funzione se ne accorge da sola e non fa nulla.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET
  if (!segreto) {
    return NextResponse.json(
      { errore: 'CRON_SECRET non configurato: salvataggio automatico disattivato.' },
      { status: 503 }
    )
  }
  if (req.headers.get('authorization') !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 })
  }

  try {
    const esito = await salvaContattiOrdini()
    return NextResponse.json({ ok: true, ...esito })
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 500 })
  }
}

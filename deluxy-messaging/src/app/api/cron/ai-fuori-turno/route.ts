import { NextRequest, NextResponse } from 'next/server'
import { giroAiFuoriTurno } from '@/lib/ai-fuori-turno'

export const dynamic = 'force-dynamic'
// Una chiamata a OpenAI per conversazione, fino a dieci: i 10 secondi di
// default non bastano.
export const maxDuration = 60

// FUORI TURNO RISPONDE L'AI — il giro, ogni dieci minuti.
//
// La regola e le quattro serrature stanno in `src/lib/ai-fuori-turno.ts`. Qui
// c'è solo il cancello: come gli altri cron, questa rotta sta fuori dal
// middleware di sessione e si autentica col `CRON_SECRET`.
//
// ⚠️⚠️ Ogni dieci minuti e non ogni minuto: un cliente che scrive di notte
// aspetta al massimo dieci minuti — che è comunque una risposta immediata
// rispetto a domattina — e nel frattempo, se stava scrivendo tre messaggi di
// fila, li ha finiti. Rispondendo al primo si risponderebbe a metà domanda.
//
// ⚠️ Si può chiamare anche a mano con `?prova=1` (da loggati, dalla rotta
// gemella `/api/ai-fuori-turno`): fa tutto tranne mandare.
export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET
  if (!segreto) {
    return NextResponse.json(
      { errore: 'CRON_SECRET non configurato: le risposte fuori turno restano spente.' },
      { status: 503 }
    )
  }
  if (req.headers.get('authorization') !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: 'Non autorizzato.' }, { status: 401 })
  }

  const esito = await giroAiFuoriTurno()
  return NextResponse.json({ ok: true, ...esito })
}

import { NextResponse } from 'next/server'
import { utenteCorrente } from '@/lib/sessione'
import { ultimoPerSezione } from '@/lib/novita'

export const dynamic = 'force-dynamic'

// Per ogni voce di menu, la data della cosa più recente: il browser la confronta
// con l'ultima che ha già visto e accende il pallino.
//
// ⚠️ Non torna conteggi e non sa niente di chi guarda: «visto» è una cosa del
// browser di quella persona, e tenerla sul server vorrebbe dire una tabella in
// più per un pallino.
export async function GET() {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  return NextResponse.json({ sezioni: await ultimoPerSezione() })
}

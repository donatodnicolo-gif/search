import { NextResponse } from 'next/server'
import { configEmail, provaSmtp } from '@/lib/email'

export const dynamic = 'force-dynamic'

// Prova le credenziali SMTP senza inviare nulla a nessuno.
export async function POST() {
  const config = await configEmail()
  if (!config) {
    return NextResponse.json(
      { ok: false, messaggio: 'Indirizzo o password mancanti (Impostazioni → Email).' },
      { status: 400 }
    )
  }
  return NextResponse.json(await provaSmtp(config))
}

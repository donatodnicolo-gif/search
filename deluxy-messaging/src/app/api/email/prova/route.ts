import { NextRequest, NextResponse } from 'next/server'
import { casellaPerId, provaCasella } from '@/lib/email'

export const dynamic = 'force-dynamic'

// Prova SMTP e IMAP di una casella SALVATA (legge dal database: prima si salva,
// poi si prova).
export async function POST(req: NextRequest) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string }
  const casella = await casellaPerId(id ?? '')
  if (!casella) {
    return NextResponse.json(
      { ok: false, messaggio: 'Casella non trovata o senza password: salva prima le impostazioni.' },
      { status: 400 }
    )
  }
  return NextResponse.json(await provaCasella(casella))
}

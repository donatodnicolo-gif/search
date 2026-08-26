import { NextRequest, NextResponse } from 'next/server'
import { casellaPerId, provaCasella } from '@/lib/email'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Prova SMTP e IMAP di una casella SALVATA (legge dal database: prima si salva,
// poi si prova).
export async function POST(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
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

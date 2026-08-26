import { NextRequest, NextResponse } from 'next/server'
import { riconosciConversazione } from '@/lib/rubrica'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
// Due o tre chiamate alla People API: i 10 secondi di default sono corti.
export const maxDuration = 30

// Chi è questo numero? Cerca SUBITO in rubrica Google, per la conversazione
// aperta. Il giro automatico (cron ogni ora) fa la stessa cosa per tutte, ma chi
// ha il cliente davanti non può aspettare l'ora.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e il cookie di un account
  // cancellato resta firmato bene per trenta giorni.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const esito = await riconosciConversazione(id)
  if (esito.motivo) return NextResponse.json({ errore: esito.motivo }, { status: 400 })
  return NextResponse.json(esito)
}

import { NextRequest, NextResponse } from 'next/server'
import { riconosciConversazione } from '@/lib/rubrica'

export const dynamic = 'force-dynamic'
// Due o tre chiamate alla People API: i 10 secondi di default sono corti.
export const maxDuration = 30

// Chi è questo numero? Cerca SUBITO in rubrica Google, per la conversazione
// aperta. Il giro automatico (cron ogni ora) fa la stessa cosa per tutte, ma chi
// ha il cliente davanti non può aspettare l'ora.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const esito = await riconosciConversazione(id)
  if (esito.motivo) return NextResponse.json({ errore: esito.motivo }, { status: 400 })
  return NextResponse.json(esito)
}

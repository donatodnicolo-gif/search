import { NextRequest, NextResponse } from 'next/server'
import { statistiche } from '@/lib/statistiche'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
// Una ventina di conteggi più due finestre SQL: sui numeri di oggi sono ~3
// secondi, e su un anno di dati diventano di più.
export const maxDuration = 60

// I numeri dell'app per un periodo. `?giorni=30` (1-365).
export async function GET(req: NextRequest) {
  // ⚠️ Chi sei. Sta qui e non solo nel middleware: quello controlla la FIRMA
  // del cookie, non che l'utente esista ancora — e questi numeri contengono
  // venduto, rimborsi e tempi di lavoro delle persone.
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })

  const giorni = Number(req.nextUrl.searchParams.get('giorni') ?? '30')
  const dati = await statistiche(Number.isFinite(giorni) ? giorni : 30)
  return NextResponse.json(dati, { headers: { 'Cache-Control': 'no-store' } })
}

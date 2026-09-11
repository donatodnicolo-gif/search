import { NextRequest, NextResponse } from 'next/server'
import { utenteCorrente } from '@/lib/sessione'
import { segnalaReclamoAllaPiattaforma } from '@/lib/segnala-reclamo'

export const dynamic = 'force-dynamic'
// Due chiamate a un'altra app (cerca la consegna, manda la segnalazione).
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

// ⭐ 11/09/2026 — RIPROVA a segnalare il reclamo alla piattaforma consegne.
//
// ⚠️ La segnalazione parte da sola quando il reclamo nasce. Questa rotta serve
// a rimediare a un buco: la piattaforma può essere stata giù, o la consegna può
// essere nata DOPO il reclamo (si apre il reclamo la mattina, la consegna si
// crea nel pomeriggio). Senza questo, l'unico modo di avvisare sarebbe
// riscrivere il reclamo — e riscriverlo per mandare un messaggio è il genere di
// trucco che poi nessuno ricorda.
//
// ⚠️ È idempotente per costruzione: `segnalatoIl` blocca il secondo invio, e
// chi riprova su un reclamo già segnalato si sente rispondere com'è andata la
// prima volta.
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const esito = await segnalaReclamoAllaPiattaforma(id, io.nome ?? '')
  return NextResponse.json(esito)
}

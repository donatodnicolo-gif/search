import { NextRequest, NextResponse } from 'next/server'
import { unisciClienti, separaCliente } from '@/lib/clienti-uniti'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// Unire (POST) e separare (DELETE) due righe della rubrica clienti.
//
// ⚠️ Nessun ordine viene toccato: si salva soltanto «questa riga vale quella».
// È il motivo per cui separare è sempre possibile e non perde niente — e per
// cui unire due persone diverse per sbaglio si rimedia in un clic, invece di
// essere un danno da riparare a mano nei dati.

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { chiavi?: string[]; principale?: string }
  const chiavi = (body.chiavi ?? []).filter(Boolean)
  const principale = (body.principale ?? '').trim()

  if (!principale || chiavi.length < 1) {
    return NextResponse.json(
      { errore: 'Servono almeno due clienti e quale dei due resta.' },
      { status: 400 }
    )
  }

  const chi = await utenteCorrente()
  const uniti = await unisciClienti(chiavi, principale, chi?.nome || chi?.email || '')
  return NextResponse.json({ uniti })
}

export async function DELETE(req: NextRequest) {
  const principale = (req.nextUrl.searchParams.get('chiave') ?? '').trim()
  if (!principale) return NextResponse.json({ errore: 'Chiave mancante' }, { status: 400 })
  const separati = await separaCliente(principale)
  return NextResponse.json({ separati })
}

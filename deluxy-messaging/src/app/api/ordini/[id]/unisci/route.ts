import { NextRequest, NextResponse } from 'next/server'
import { disfaUnione, unisciOrdini } from '@/lib/unione-ordini'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Unisce un altro ordine a questo, o disfa l'unione.
//
//   POST   /api/ordini/<id>/unisci   { numero: "#1777" }
//   DELETE /api/ordini/<id>/unisci   → l'ordine <id> torna a sé
//
// ⚠️ Le regole (chi può unire chi, il numero su più negozi, la catena vietata)
// stanno in `src/lib/unione-ordini.ts`, non qui: le usa anche chi vorrà unire
// da un'altra schermata, e duplicarle vorrebbe dire vederle divergere.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const io = await utenteCorrente()
  const { numero } = (await req.json().catch(() => ({}))) as { numero?: string }
  const esito = await unisciOrdini(id, numero ?? '', io?.nome ?? '')
  return NextResponse.json(esito, { status: esito.ok ? 200 : 400 })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  // ⚠️ Chi sei: il middleware controlla la FIRMA del cookie, non che
  // l'utente esista ancora.
  const _io = await utenteCorrente()
  if (!_io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const esito = await disfaUnione(id)
  return NextResponse.json(esito, { status: esito.ok ? 200 : 400 })
}

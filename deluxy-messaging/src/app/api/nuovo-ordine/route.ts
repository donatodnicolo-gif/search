import { NextRequest, NextResponse } from 'next/server'
import { creaOrdine, type DatiNuovoOrdine } from '@/lib/nuovo-ordine'
import { datiDaCorpo } from '@/lib/nuovo-ordine-corpo'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Crea l'ordine su Shopify: bozza + link di pagamento, oppure ordine già pagato.
export async function POST(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Sessione scaduta' }, { status: 401 })

  const d = (await req.json().catch(() => ({}))) as Partial<DatiNuovoOrdine>
  if (!d.negozioId) return NextResponse.json({ errore: 'Scegli il negozio.' }, { status: 400 })
  if (!d.righe?.length) return NextResponse.json({ errore: 'Aggiungi almeno un prodotto.' }, { status: 400 })

  // La traduzione corpo → dati è condivisa con PUT /api/bozze/[id] (modifica
  // di una bozza): `src/lib/nuovo-ordine-corpo.ts`.
  const esito = await creaOrdine(datiDaCorpo(d, { id: io.id, nome: io.nome }))
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 })
  return NextResponse.json(esito)
}

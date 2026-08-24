import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { utenteCorrente } from '@/lib/sessione'
import { comunicaSmistamentoAOrders } from '@/lib/orders'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// IL GOVERNO DEL GIRO (Standard §7.4): l'operatore decide se questo ordine
// può andare nello smistamento automatico della piattaforma o se ce lo
// teniamo noi. La VERITÀ sta su Orders (è il registro che la piattaforma
// legge): prima si scrive là, e solo se là è andata si aggiorna il riflesso
// locale — un flag locale diverso da quello vero farebbe credere «riservato»
// a un ordine che l'automatico sta già smistando.
export async function POST(req: NextRequest, { params }: Params) {
  const utente = await utenteCorrente()
  if (!utente) return NextResponse.json({ errore: 'Non autenticato' }, { status: 401 })

  const { id } = await params
  const ordine = await db.ordine.findUnique({
    where: { id },
    select: { id: true, numero: true, shopifyId: true, annullatoIl: true },
  })
  if (!ordine) return NextResponse.json({ errore: 'Ordine non trovato' }, { status: 404 })
  if (ordine.annullatoIl) {
    return NextResponse.json({ errore: 'Ordine annullato su Shopify: non si lavora.' }, { status: 409 })
  }

  const corpo = (await req.json().catch(() => ({}))) as { modo?: string }
  const modo = corpo.modo === 'manuale' ? 'manuale' : corpo.modo === 'auto' ? 'auto' : null
  if (!modo) return NextResponse.json({ errore: 'modo: "manuale" oppure "auto"' }, { status: 400 })

  const esito = await comunicaSmistamentoAOrders(ordine.numero, ordine.shopifyId, modo)
  if (!esito.ok) return NextResponse.json({ errore: esito.messaggio }, { status: 502 })

  const aggiornato = await db.ordine.update({
    where: { id },
    data: { smistamento: modo === 'manuale' ? 'manuale' : '' },
    select: { smistamento: true },
  })
  return NextResponse.json({ ok: true, smistamento: aggiornato.smistamento })
}

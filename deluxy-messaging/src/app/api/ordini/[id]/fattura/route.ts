import { NextRequest, NextResponse } from 'next/server'
import {
  chiudiRichiestaFattura,
  fatturaDellOrdine,
  salvaRichiestaFattura,
  type DatiFattura,
} from '@/lib/richiesta-fattura'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// LA FATTURA CHIESTA DAL CLIENTE su un ordine.
//
//   GET  → la richiesta, se c'è, con cosa manca per emetterla
//   POST { azione: 'salva', …dati }   → apre o aggiorna la richiesta
//   POST { azione: 'stato', stato, numeroFattura } → emessa | non dovuta
//
// ⚠️⚠️ Qui non si emette niente: la fattura elettronica esce da FINANCE/Fatture
// in Cloud. Questa rotta tiene la richiesta e i dati fiscali del cliente.
export async function GET(_req: NextRequest, { params }: Params) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  return NextResponse.json({ fattura: await fatturaDellOrdine(id) })
}

export async function POST(req: NextRequest, { params }: Params) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const { id } = await params
  const c = (await req.json().catch(() => ({}))) as Partial<DatiFattura> & {
    azione?: string
    stato?: string
    numeroFattura?: string
  }

  if (c.azione === 'stato') {
    const esito = await chiudiRichiestaFattura(
      id,
      String(c.stato ?? ''),
      String(c.numeroFattura ?? ''),
      { nome: io.nome }
    )
    if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 400 })
    return NextResponse.json({ ok: true, fattura: await fatturaDellOrdine(id) })
  }

  const esito = await salvaRichiestaFattura(id, c, { nome: io.nome })
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 400 })
  return NextResponse.json({ ok: true, fattura: esito.fattura })
}

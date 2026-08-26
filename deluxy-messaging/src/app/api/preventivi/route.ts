import { NextRequest, NextResponse } from 'next/server'
import { creaPreventivo, elencoPreventivi } from '@/lib/preventivi'
import { utenteCorrente } from '@/lib/sessione'

export const dynamic = 'force-dynamic'

// I preventivi: le richieste di prezzo che non sono ancora ordini.
//
// GET  /api/preventivi?stato=aperti|tutti|da_fare|inviato|…&negozio=<id>&q=
// POST /api/preventivi   { richiesta, clienteNome, email, telefono, negozioId, … }
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const esito = await elencoPreventivi({
    stato: p.get('stato')?.trim() || 'aperti',
    negozioId: p.get('negozio')?.trim() || undefined,
    q: p.get('q')?.trim() || undefined,
  })
  return NextResponse.json(esito)
}

export async function POST(req: NextRequest) {
  const c = (await req.json().catch(() => ({}))) as Record<string, string>
  const io = await utenteCorrente()
  const esito = await creaPreventivo(
    {
      negozioId: c.negozioId,
      clienteNome: c.clienteNome,
      email: c.email,
      telefono: c.telefono,
      richiesta: c.richiesta ?? '',
      occasione: c.occasione,
      citta: c.citta,
      dataConsegna: c.dataConsegna,
      fasciaConsegna: c.fasciaConsegna,
      origine: c.origine,
      conversazioneId: c.conversazioneId,
      chiamataId: c.chiamataId,
      note: c.note,
    },
    io ? { id: io.id, nome: io.nome } : null
  )
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 400 })
  return NextResponse.json({ ok: true, id: esito.id })
}

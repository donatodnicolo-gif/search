import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { riassumiConversazione } from '@/lib/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

// Il riassunto di una conversazione: cosa vuole il cliente, e soprattutto
// **data, ora, luogo e prodotto** se li ha detti.
//
// GET torna quello già salvato (istantaneo), POST lo rifà. Si salva perché una
// conversazione che non è cambiata dà lo stesso riassunto, e rifarlo a ogni
// apertura vuol dire pagare e far aspettare per niente.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const c = await db.conversazione.findUnique({
    where: { id },
    select: { riassunto: true, riassuntoIl: true },
  })
  if (!c) return NextResponse.json({ errore: 'Conversazione non trovata' }, { status: 404 })
  return NextResponse.json({
    riassunto: c.riassunto ? JSON.parse(c.riassunto) : null,
    fattoIl: c.riassuntoIl,
  })
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const conversazione = await db.conversazione.findUnique({ where: { id }, select: { id: true } })
  if (!conversazione) {
    return NextResponse.json({ errore: 'Conversazione non trovata' }, { status: 404 })
  }

  const messaggi = await db.messaggio.findMany({
    where: { conversazioneId: id },
    orderBy: { creatoIl: 'asc' },
    take: 200,
    select: { direzione: true, testo: true, creatoIl: true },
  })

  const esito = await riassumiConversazione(messaggi)
  if (esito.stato === 'non-configurato') {
    return NextResponse.json(
      { errore: 'Riassunto non attivo: manca la chiave OpenAI (Impostazioni).' },
      { status: 400 }
    )
  }
  if (esito.stato === 'errore') {
    return NextResponse.json({ errore: esito.messaggio }, { status: 502 })
  }

  const fattoIl = new Date()
  await db.conversazione.update({
    where: { id },
    data: { riassunto: JSON.stringify(esito.riassunto), riassuntoIl: fattoIl },
  })

  return NextResponse.json({ riassunto: esito.riassunto, fattoIl, fornitore: esito.fornitore })
}

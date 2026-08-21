import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { evidenzaDaShopify, rispondiChargeback } from '@/lib/chargeback'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

// Una contestazione, con quello che risulta già scritto su Shopify.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const riga = await db.chargeback.findUnique({ where: { id } })
  if (!riga) return NextResponse.json({ errore: 'Contestazione non trovata' }, { status: 404 })
  // ⚠️ L'evidenza si chiede a Shopify, non si tiene in copia: se qualcuno ha
  // risposto dal pannello di Shopify, qui si deve vedere — altrimenti si
  // riscrive sopra il lavoro di un collega.
  const evidenza = await evidenzaDaShopify(id).catch(() => null)
  return NextResponse.json({ chargeback: riga, evidenza })
}

// Salva la risposta (`invia: false`) o la manda davvero (`invia: true`).
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { testo, invia } = (await req.json().catch(() => ({}))) as {
    testo?: string
    invia?: boolean
  }
  const pulito = (testo ?? '').trim()
  if (!pulito) {
    return NextResponse.json({ errore: 'La risposta è vuota.' }, { status: 400 })
  }
  // ⚠️ Il salvataggio della sola bozza NON passa da Shopify: si scrive in
  // tabella e basta. Mandare a Shopify a ogni tasto vorrebbe dire che una bozza
  // a metà diventa la nostra difesa ufficiale.
  if (!invia) {
    const riga = await db.chargeback.update({
      where: { id },
      data: { bozzaRisposta: pulito },
    })
    return NextResponse.json({ chargeback: riga, inviata: false })
  }
  const esito = await rispondiChargeback(id, pulito, true)
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 })
  const riga = await db.chargeback.findUnique({ where: { id } })
  return NextResponse.json({ chargeback: riga, inviata: true })
}

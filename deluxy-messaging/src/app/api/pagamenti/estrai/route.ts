import { NextRequest, NextResponse } from 'next/server'
import { estraiPagamento } from '@/lib/ai'
import { stringaPagamento } from '@/lib/iban'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Legge IBAN, intestatario e importo da un testo incollato o da un'immagine
// caricata (schermata di una chat, foto di un bonifico).
export async function POST(req: NextRequest) {
  const corpo = (await req.json().catch(() => ({}))) as {
    testo?: string
    immagine?: { dati?: string; tipo?: string }
  }

  const testo = (corpo.testo ?? '').trim()
  const immagine =
    corpo.immagine?.dati && corpo.immagine?.tipo
      ? { dati: corpo.immagine.dati, tipo: corpo.immagine.tipo }
      : undefined

  if (!testo && !immagine) {
    return NextResponse.json({ errore: 'Serve un testo o un’immagine.' }, { status: 400 })
  }

  const esito = await estraiPagamento({ testo: testo || undefined, immagine })

  if (esito.stato === 'non-configurato') {
    return NextResponse.json(
      { errore: 'Lettura AI non configurata: manca la chiave OpenAI (Impostazioni).' },
      { status: 400 }
    )
  }
  if (esito.stato === 'errore') {
    return NextResponse.json({ errore: esito.messaggio }, { status: 502 })
  }

  return NextResponse.json({
    dati: esito.dati,
    ibanValido: esito.ibanValido,
    motivoIban: esito.motivoIban,
    fornitore: esito.fornitore, // quale modello ha letto: utile quando l'esito sorprende
    stringa: stringaPagamento(esito.dati),
  })
}

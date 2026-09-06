import { NextRequest, NextResponse } from 'next/server'
import { utenteCorrente } from '@/lib/sessione'
import { prodottiPiattaforma } from '@/lib/piattaforma'

export const dynamic = 'force-dynamic'

// IL CATALOGO PRODOTTI DELLA PIATTAFORMA, per il modulo «Manda in app».
//
//   GET /api/piattaforma/prodotti?q=rose&partnerId=<id>
//
// ⚠️ Nessuna copia: il prodotto ha una casa sola ed è la piattaforma consegne
// (la riga di consegna vuole un suo `productId`). Qui si fa solo da tramite,
// con la sessione davanti e la chiave della piattaforma dietro — la chiave non
// esce mai nel browser.
export async function GET(req: NextRequest) {
  const io = await utenteCorrente()
  if (!io) return NextResponse.json({ errore: 'Non autenticato.' }, { status: 401 })
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80)
  const partnerId = (req.nextUrl.searchParams.get('partnerId') ?? '').trim().slice(0, 60)
  const esito = await prodottiPiattaforma(q, partnerId)
  if (esito.stato === 'non-configurato') {
    return NextResponse.json({ errore: 'Chiave della piattaforma non configurata (Impostazioni).' }, { status: 400 })
  }
  if (esito.stato === 'non-trovato') {
    return NextResponse.json(
      { errore: 'La piattaforma non ha ancora la rotta dei prodotti: va pubblicata di là.' },
      { status: 502 }
    )
  }
  if (esito.stato === 'errore') return NextResponse.json({ errore: esito.messaggio }, { status: 502 })
  return NextResponse.json(esito.dati)
}

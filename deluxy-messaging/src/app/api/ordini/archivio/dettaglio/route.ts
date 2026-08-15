import { NextRequest, NextResponse } from 'next/server'
import { dettaglioOrdineArchivio } from '@/lib/dettaglio-ordine'

export const dynamic = 'force-dynamic'

// Il dettaglio di un ordine dell'ARCHIVIO STORICO, cioè più vecchio dei 60
// giorni che teniamo in casa: si apre cliccando una riga dei risultati in
// «Ordini globali».
//
// Si identifica con numero + `orderId` (il gid Shopify): lo stesso numero
// esiste su più negozi — «#1733» c'è sia su Cake sia su Deluxy — e aprire
// l'ordine di un altro marchio è peggio che non aprirne nessuno.
export async function GET(req: NextRequest) {
  const numero = (req.nextUrl.searchParams.get('numero') ?? '').trim()
  const orderId = (req.nextUrl.searchParams.get('orderId') ?? '').trim()
  if (!numero) return NextResponse.json({ errore: 'Ordine senza numero.' }, { status: 400 })

  const esito = await dettaglioOrdineArchivio(numero, orderId)
  if (esito.stato !== 'ok') {
    // 502: il pezzo mancante non è nostro, è la risposta del registro Ordini.
    return NextResponse.json({ errore: esito.messaggio }, { status: 502 })
  }
  return NextResponse.json(esito.dati)
}

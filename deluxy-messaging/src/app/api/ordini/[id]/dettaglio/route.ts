import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { righeOrdineDaOrders } from '@/lib/orders'
import { brandRicercaDaNegozio } from '@/lib/negozi'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

// Il dettaglio di un ordine: quello che abbiamo in casa più i PRODOTTI (con le
// foto), che stanno nel registro Ordini e si chiedono a lui.
//
// Le righe non si tengono in copia: servono solo qui, e duplicare il catalogo
// vorrebbe dire mantenerlo aggiornato mentre Orders lo sincronizza già.
// Se Orders non risponde, l'ordine si apre comunque con i dati locali e si dice
// perché i prodotti non ci sono: meglio mezzo dettaglio che una pagina bianca.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const ordine = await db.ordine.findUnique({ where: { id } })
  if (!ordine) return NextResponse.json({ errore: 'Ordine non trovato' }, { status: 404 })

  const negozio = await db.negozioShopify.findUnique({ where: { id: ordine.negozioId } })
  const brandRicerca = negozio
    ? brandRicercaDaNegozio(negozio.nome, negozio.dominio, negozio.brandRicerca)
    : ''

  // `shopifyId` è il gid Shopify: identifica l'ordine anche quando lo stesso
  // numero esiste su più negozi.
  const esito = await righeOrdineDaOrders(ordine.numero, ordine.shopifyId)

  return NextResponse.json({
    ordine: {
      id: ordine.id,
      numero: ordine.numero,
      negozioNome: ordine.negozioNome,
      brandRicerca,
      data: ordine.data.toISOString(),
      totale: ordine.totale,
      valuta: ordine.valuta,
      statoPagamento: ordine.statoPagamento,
      clienteNome: ordine.clienteNome,
      telefono: ordine.telefono,
      email: ordine.email,
      indirizzo: ordine.indirizzo,
      citta: ordine.citta,
      paese: ordine.paese,
      dataConsegna: ordine.dataConsegna ? ordine.dataConsegna.toISOString() : null,
      fasciaConsegna: ordine.fasciaConsegna,
      statoNome: ordine.statoNome,
      statoColore: ordine.statoColore,
      note: ordine.note,
      gestione: ordine.gestione,
      clienteTipo: ordine.clienteTipo,
      clienteTipoDa: ordine.clienteTipoDa,
    },
    righe: esito.stato === 'ok' ? esito.righe : [],
    // Il DESTINATARIO e l'indirizzo di consegna arrivano da Orders: qui in casa
    // c'è solo chi compra. Nei regali sono quasi sempre due persone diverse, e
    // confonderle vuol dire scrivere alla persona sbagliata.
    spedizione: esito.stato === 'ok' ? esito.spedizione : null,
    biglietto: esito.stato === 'ok' ? esito.biglietto : '',
    // Perché i prodotti non ci sono, quando non ci sono.
    righeNota:
      esito.stato === 'ok'
        ? ''
        : esito.stato === 'non-configurato'
          ? 'Registro Ordini non collegato: metti URL e chiave in Impostazioni.'
          : esito.messaggio,
  })
}

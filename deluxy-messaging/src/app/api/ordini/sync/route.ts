import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { leggiImpostazioni } from '@/lib/impostazioni'
import { scaricaOrdini } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

// Scarica gli ordini recenti da Shopify e li salva/aggiorna in locale.
// Protetto dal middleware di sessione (lo avvia l'operatore dalla pagina Ordini).
export async function POST() {
  const { shopifyDominio, shopifyToken } = await leggiImpostazioni(['shopifyDominio', 'shopifyToken'])
  if (!shopifyDominio || !shopifyToken) {
    return NextResponse.json(
      { errore: 'Shopify non configurato: dominio o token mancanti (Impostazioni).' },
      { status: 400 }
    )
  }

  // Ultimi 60 giorni: abbastanza per gli ordini "che riceviamo" senza scaricare tutto.
  const dal = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)

  let ordini
  try {
    ordini = await scaricaOrdini(shopifyDominio, shopifyToken, dal)
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 502 })
  }

  let nuovi = 0
  for (const o of ordini) {
    const esito = await db.ordine.upsert({
      where: { shopifyId: o.shopifyId },
      // Non sovrascriviamo contattoSalvato/contattoEsito: sono nostri, non di Shopify.
      update: {
        numero: o.numero,
        data: o.data,
        totale: o.totale,
        valuta: o.valuta,
        statoPagamento: o.statoPagamento,
        clienteNome: o.clienteNome,
        telefono: o.telefono,
        email: o.email,
        indirizzo: o.indirizzo,
        note: o.note,
      },
      create: {
        shopifyId: o.shopifyId,
        numero: o.numero,
        data: o.data,
        totale: o.totale,
        valuta: o.valuta,
        statoPagamento: o.statoPagamento,
        clienteNome: o.clienteNome,
        telefono: o.telefono,
        email: o.email,
        indirizzo: o.indirizzo,
        note: o.note,
      },
    })
    // upsert non dice se ha creato: lo deduciamo dal fatto che creatoIl ≈ ora.
    if (Date.now() - esito.creatoIl.getTime() < 5000) nuovi++
  }

  return NextResponse.json({ scaricati: ordini.length, nuovi })
}

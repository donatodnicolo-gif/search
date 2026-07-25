import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { negoziAttivi, tokenPerNegozio } from '@/lib/negozi'
import { scaricaOrdini } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

// Scarica gli ordini recenti da TUTTI i negozi Shopify attivi e li salva/aggiorna
// in locale, marcando ogni ordine col suo negozio. Riporta l'esito per-negozio,
// così un negozio mal configurato non blocca gli altri.
export async function POST() {
  const negozi = await negoziAttivi()
  if (negozi.length === 0) {
    return NextResponse.json(
      { errore: 'Nessun negozio Shopify configurato: aggiungine uno in Negozi.' },
      { status: 400 }
    )
  }

  // Ultimi 60 giorni: abbastanza per gli ordini "che riceviamo" senza scaricare tutto.
  const dal = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)

  const risultati: { negozio: string; ok: boolean; scaricati: number; nuovi: number; errore: string }[] = []

  for (const negozio of negozi) {
    try {
      const { dominio, token } = await tokenPerNegozio(negozio)
      const ordini = await scaricaOrdini(dominio, token, dal)
      let nuovi = 0
      for (const o of ordini) {
        const esito = await db.ordine.upsert({
          where: { negozioId_shopifyId: { negozioId: negozio.id, shopifyId: o.shopifyId } },
          // Non sovrascriviamo contattoSalvato/contattoEsito: sono nostri, non di Shopify.
          update: {
            negozioNome: negozio.nome,
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
            negozioId: negozio.id,
            negozioNome: negozio.nome,
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
        if (Date.now() - esito.creatoIl.getTime() < 5000) nuovi++
      }
      risultati.push({ negozio: negozio.nome, ok: true, scaricati: ordini.length, nuovi, errore: '' })
    } catch (e) {
      risultati.push({
        negozio: negozio.nome,
        ok: false,
        scaricati: 0,
        nuovi: 0,
        errore: (e as Error).message,
      })
    }
  }

  const scaricati = risultati.reduce((s, r) => s + r.scaricati, 0)
  const nuovi = risultati.reduce((s, r) => s + r.nuovi, 0)
  return NextResponse.json({ scaricati, nuovi, risultati })
}

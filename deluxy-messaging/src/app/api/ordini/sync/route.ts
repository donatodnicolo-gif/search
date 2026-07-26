import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { salvaContattiOrdini } from '@/lib/contatti'
import { brandRicercaDaNegozio, prefissoDaNegozio } from '@/lib/negozi'
import { scaricaOrdiniDaOrders } from '@/lib/orders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Gli ordini arrivano dal registro centralizzato Deluxy Orders (che a sua volta
// sincronizza Shopify): una sola fonte di verità per tutte le app, con la stessa
// classificazione. Qui se ne tiene una copia recente per lavorarci in inbox.
//
// Ogni brand di Orders diventa un "negozio" locale: serve alle colonne della
// bacheca, alla sigla in rubrica (FL/CK/DL) e al bottone Fornitore. Se un brand
// non c'è ancora, si crea da solo — senza credenziali, perché non serve più
// parlare con Shopify.
type Negozio = { id: string; nome: string }

async function negozioPerBrand(brand: string, cache: Map<string, Negozio>): Promise<Negozio> {
  const chiave = brand.trim().toLowerCase()
  const gia = cache.get(chiave)
  if (gia) return gia

  // solo alla prima comparsa di un brand: poi risponde la cache
  const esistenti = await db.negozioShopify.findMany()
  const trovato = esistenti.find(
    (n) =>
      n.nome.trim().toLowerCase() === chiave ||
      n.dominio.trim().toLowerCase() === chiave ||
      brandRicercaDaNegozio(n.nome, n.dominio, n.brandRicerca).toLowerCase() ===
        brandRicercaDaNegozio(brand, '').toLowerCase()
  )
  if (trovato) {
    const n = { id: trovato.id, nome: trovato.nome }
    cache.set(chiave, n)
    return n
  }

  const creato = await db.negozioShopify.create({
    data: {
      nome: brand,
      dominio: chiave,
      prefisso: prefissoDaNegozio(brand, ''),
      brandRicerca: brandRicercaDaNegozio(brand, ''),
    },
  })
  const n = { id: creato.id, nome: creato.nome }
  cache.set(chiave, n)
  return n
}

export async function POST() {
  // Aggiornamento INCREMENTALE: si riparte dal giorno dell'ordine più recente
  // che abbiamo (meno un giorno di margine), non dai 60 giorni pieni. Così il
  // primo giro è l'unico lungo e i successivi durano pochi secondi — necessario
  // perché su Vercel una funzione ha un tetto di tempo.
  const piuRecente = await db.ordine.findFirst({ orderBy: { data: 'desc' }, select: { data: true } })
  const giorniIndietro = piuRecente
    ? Math.max(1, Math.ceil((Date.now() - piuRecente.data.getTime()) / 86400000) + 1)
    : 60

  let ordini
  try {
    ordini = await scaricaOrdiniDaOrders(Math.min(giorniIndietro, 60))
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 502 })
  }

  const cache = new Map<string, Negozio>()
  let nuovi = 0

  for (const o of ordini) {
    const negozio = await negozioPerBrand(o.brand || 'senza brand', cache)
    const negozioId = negozio.id
    const comuni = {
      // il nome del NEGOZIO, non il brand grezzo: Orders chiama lo stesso
      // negozio ora "Flowers" ora "deluxyflowers.com", qui dev'essere uno solo
      negozioNome: negozio.nome,
      numero: o.numero,
      data: new Date(o.data),
      totale: o.totale,
      valuta: o.valuta || 'EUR',
      clienteNome: o.clienteNome,
      telefono: o.telefono,
      email: o.email,
      citta: o.citta,
    }
    const esito = await db.ordine.upsert({
      // il gid Shopify è la chiave stabile: gli ordini presi prima da Shopify
      // si aggiornano invece di duplicarsi
      where: { negozioId_shopifyId: { negozioId, shopifyId: o.orderId } },
      // contattoSalvato/contattoEsito sono nostri: non si sovrascrivono
      update: comuni,
      create: { negozioId, shopifyId: o.orderId, ...comuni },
    })
    if (Date.now() - esito.creatoIl.getTime() < 5000) nuovi++
  }

  // Salvataggio automatico dei contatti (salta da solo se Google non è collegato).
  let contatti
  try {
    contatti = await salvaContattiOrdini()
  } catch (e) {
    contatti = { errore: (e as Error).message }
  }

  return NextResponse.json({ scaricati: ordini.length, nuovi, contatti })
}

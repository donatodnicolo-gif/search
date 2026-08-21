// Creare un ordine per un cliente al telefono.
//
// Il caso vero: il cliente chiama o scrive, l'ordine non c'è ancora, e finora
// bisognava uscire dall'app, aprire Shopify, ricostruire indirizzo e consegna a
// mano e tornare indietro. Qui si fa in una schermata sola, col cliente già
// davanti.
//
// ⚠️⚠️ L'ORDINE NASCE IN SHOPIFY, NON DA NOI. Si crea una **bozza d'ordine**
// (`draftOrderCreate`) e poi la si manda al cliente o la si chiude come pagata:
// l'ordine vero lo fa Shopify, e ci torna dal registro Deluxy Orders come tutti
// gli altri. Se lo scrivessimo nella nostra tabella avremmo un ordine che esiste
// solo qui — invisibile alla logistica, alla contabilità e a Shopify.
//
// ⚠️ La consegna si scrive negli attributi che il registro sa leggere —
// `Data_Consegna` e `Fascia_Oraria_Consegna` — altrimenti l'ordine torna
// indietro «consegna non indicata» e finisce in fondo alla bacheca.

import { db } from './db'
import { decifra } from './crypto'

const VERSIONE = '2025-01'

type Negozio = { id: string; nome: string; dominio: string; clientId: string; clientSecret: string }

async function negozio(id: string): Promise<Negozio | null> {
  return db.negozioShopify.findUnique({
    where: { id },
    select: { id: true, nome: true, dominio: true, clientId: true, clientSecret: true },
  })
}

async function token(n: Negozio): Promise<string> {
  if (!n.clientId || !n.clientSecret) return ''
  const res = await fetch(`https://${n.dominio}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: n.clientId,
      client_secret: decifra(n.clientSecret),
    }),
    cache: 'no-store',
  })
  const j = (await res.json().catch(() => ({}))) as { access_token?: string }
  return j.access_token ?? ''
}

async function graphql<T>(n: Negozio, t: string, query: string, variables?: unknown): Promise<T> {
  const res = await fetch(`https://${n.dominio}/admin/api/${VERSIONE}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': t },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  })
  return (await res.json()) as T
}

export type ProdottoTrovato = {
  variantId: string
  titolo: string
  variante: string
  prezzo: number
  valuta: string
  immagine: string
  disponibile: boolean
}

/** I prodotti del negozio che corrispondono a quello che si sta cercando. */
export type EsitoProdotti =
  | { stato: 'ok'; prodotti: ProdottoTrovato[] }
  | { stato: 'senza-permesso' }
  | { stato: 'errore'; messaggio: string }

/**
 * I prodotti del negozio che corrispondono a quello che si sta cercando.
 *
 * ⚠️ Se manca il permesso `read_products` NON si torna una lista vuota: una
 * lista vuota vuol dire «non c'è niente che si chiami così», ed è un'altra cosa
 * da «non posso guardare». Chi cerca deve sapere quale delle due.
 */
export async function cercaProdotti(negozioId: string, q: string): Promise<EsitoProdotti> {
  const n = await negozio(negozioId)
  if (!n) return { stato: 'errore', messaggio: 'Negozio non trovato.' }
  const t = await token(n)
  if (!t) return { stato: 'errore', messaggio: 'Shopify non ha dato un token.' }
  const d = await graphql<{
    errors?: { message: string; extensions?: { code?: string } }[]
    data?: {
      products?: {
        edges?: {
          node: {
            title: string
            featuredImage?: { url?: string } | null
            variants?: {
              edges?: {
                node: {
                  id: string
                  title: string
                  price: string
                  availableForSale: boolean
                  image?: { url?: string } | null
                }
              }[]
            }
          }
        }[]
      }
    }
  }>(
    n,
    t,
    `query Cerca($q: String!) {
      products(first: 12, query: $q) {
        edges { node {
          title
          featuredImage { url }
          variants(first: 12) { edges { node { id title price availableForSale image { url } } } }
        } }
      }
    }`,
    { q }
  )
  const errore = d.errors?.[0]
  if (errore) {
    if (errore.extensions?.code === 'ACCESS_DENIED' || /access denied/i.test(errore.message)) {
      return { stato: 'senza-permesso' }
    }
    return { stato: 'errore', messaggio: errore.message }
  }

  const fuori: ProdottoTrovato[] = []
  for (const p of d.data?.products?.edges ?? []) {
    for (const v of p.node.variants?.edges ?? []) {
      fuori.push({
        variantId: v.node.id,
        titolo: p.node.title,
        // «Default Title» è come Shopify chiama la variante unica: mostrarlo
        // sarebbe gergo, e non aggiunge niente.
        variante: v.node.title === 'Default Title' ? '' : v.node.title,
        prezzo: Number(v.node.price) || 0,
        valuta: 'EUR',
        immagine: v.node.image?.url ?? p.node.featuredImage?.url ?? '',
        disponibile: v.node.availableForSale,
      })
    }
  }
  return { stato: 'ok', prodotti: fuori.slice(0, 30) }
}

export type DatiNuovoOrdine = {
  negozioId: string
  cliente: { nome: string; cognome: string; email: string; telefono: string }
  consegna: {
    /** `2026-08-25`. Vuota = nessuna data (l'ordine tornerà «non indicata»). */
    data: string
    /** «16-20», come la scrive il cliente. */
    fascia: string
    indirizzo: string
    civicoNote: string
    cap: string
    citta: string
    provincia: string
    paese: string
  }
  /**
   * Le righe dell'ordine. Due forme, e non è un ripiego temporaneo:
   * · `variantId` — il prodotto vero del catalogo (con foto, SKU, magazzino);
   * · `titolo` + `prezzo` — una riga scritta a mano.
   *
   * ⚠️ La riga a mano serve ORA perché l'app **non ha il permesso di leggere il
   * catalogo** (`read_products`): senza, un ordine si può comunque fare, ma
   * l'ordine che torna indietro non ha la foto del prodotto — cioè proprio la
   * cosa che si manda al fornitore. Appena il permesso c'è, si sceglie dal
   * catalogo e questa forma resta per i fuori-listino veri.
   */
  righe: { variantId?: string; titolo?: string; prezzo?: number; quantita: number }[]
  biglietto: string
  spedizione: { titolo: string; prezzo: number }
  /**
   * Come paga:
   * · `link` — gli si manda il link di pagamento e paga lui (resta bozza finché
   *   non paga);
   * · `pagato` — ha già pagato (bonifico, contanti, POS): l'ordine nasce
   *   **pagato**.
   */
  pagamento: 'link' | 'pagato'
  /** Con quale mezzo ha pagato: finisce nelle note dell'ordine. */
  mezzoPagamento: string
}

export type EsitoNuovoOrdine =
  | { ok: true; bozzaId: string; linkPagamento: string; ordineNumero: string; inviato: boolean }
  | { ok: false; errore: string }

/**
 * Crea l'ordine.
 *
 * ⚠️ Due strade, e la differenza è dove finiscono i soldi:
 * · **link** → la bozza resta bozza e il cliente paga da Shopify. Nessun
 *   incasso registrato che non sia vero.
 * · **pagato** → la bozza si chiude subito e l'ordine nasce **pagato**: si usa
 *   SOLO quando i soldi sono già arrivati (bonifico visto, contanti, POS). Con
 *   che mezzo, resta scritto nelle note dell'ordine — su Shopify si vedrà come
 *   pagamento manuale, e senza quella riga non si saprebbe più.
 */
export async function creaOrdine(d: DatiNuovoOrdine): Promise<EsitoNuovoOrdine> {
  const n = await negozio(d.negozioId)
  if (!n) return { ok: false, errore: 'Negozio non trovato.' }
  const t = await token(n)
  if (!t) return { ok: false, errore: 'Shopify non ha dato un token per questo negozio.' }
  if (!d.righe.length) return { ok: false, errore: 'Aggiungi almeno un prodotto.' }

  const note = [
    d.biglietto.trim() ? `Biglietto: ${d.biglietto.trim()}` : '',
    d.consegna.civicoNote.trim() ? `Note consegna: ${d.consegna.civicoNote.trim()}` : '',
    d.pagamento === 'pagato' && d.mezzoPagamento.trim()
      ? `Pagato con: ${d.mezzoPagamento.trim()} (registrato dal servizio clienti)`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  const input: Record<string, unknown> = {
    email: d.cliente.email.trim() || undefined,
    phone: d.cliente.telefono.trim() || undefined,
    note: note || undefined,
    // ⚠️ Gli attributi con QUESTI nomi: sono quelli che il registro legge per
    // ricavare data e fascia di consegna.
    customAttributes: [
      ...(d.consegna.data ? [{ key: 'Data_Consegna', value: d.consegna.data }] : []),
      ...(d.consegna.fascia.trim()
        ? [{ key: 'Fascia_Oraria_Consegna', value: d.consegna.fascia.trim() }]
        : []),
    ],
    // Da dove arriva: serve a distinguerli dagli ordini fatti dal sito.
    tags: ['servizio-clienti'],
    lineItems: d.righe.map((r) =>
      r.variantId
        ? { variantId: r.variantId, quantity: Math.max(1, r.quantita) }
        : {
            title: (r.titolo ?? 'Prodotto').trim() || 'Prodotto',
            originalUnitPriceWithCurrency: {
              amount: String(Math.max(0, r.prezzo ?? 0)),
              currencyCode: 'EUR',
            },
            quantity: Math.max(1, r.quantita),
            requiresShipping: true,
          }
    ),
    shippingAddress: {
      firstName: d.cliente.nome.trim() || 'Cliente',
      lastName: d.cliente.cognome.trim() || '.',
      address1: d.consegna.indirizzo.trim(),
      address2: d.consegna.civicoNote.trim() || undefined,
      city: d.consegna.citta.trim(),
      zip: d.consegna.cap.trim(),
      provinceCode: d.consegna.provincia.trim() || undefined,
      countryCode: (d.consegna.paese.trim() || 'IT').toUpperCase(),
      phone: d.cliente.telefono.trim() || undefined,
    },
    ...(d.spedizione.titolo.trim()
      ? {
          shippingLine: {
            title: d.spedizione.titolo.trim(),
            price: String(Math.max(0, d.spedizione.prezzo)),
          },
        }
      : {}),
  }

  const creata = await graphql<{
    data?: {
      draftOrderCreate?: {
        draftOrder?: { id: string; invoiceUrl: string; name: string } | null
        userErrors?: { field: string[]; message: string }[]
      }
    }
    errors?: { message: string }[]
  }>(
    n,
    t,
    `mutation Crea($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id invoiceUrl name }
        userErrors { field message }
      }
    }`,
    { input }
  )
  const erroreCrea =
    creata.errors?.[0]?.message || creata.data?.draftOrderCreate?.userErrors?.[0]?.message
  if (erroreCrea) return { ok: false, errore: erroreCrea }
  const bozza = creata.data?.draftOrderCreate?.draftOrder
  if (!bozza) return { ok: false, errore: 'Shopify non ha creato la bozza.' }

  if (d.pagamento === 'link') {
    // ⚠️ La mail con il link la manda Shopify solo se c'è un indirizzo: senza,
    // il link si copia e si manda da qui (WhatsApp, o la nostra posta).
    let inviato = false
    if (d.cliente.email.trim()) {
      const inv = await graphql<{
        data?: { draftOrderInvoiceSend?: { userErrors?: { message: string }[] } }
        errors?: { message: string }[]
      }>(
        n,
        t,
        `mutation Invia($id: ID!) {
          draftOrderInvoiceSend(id: $id) { userErrors { message } }
        }`,
        { id: bozza.id }
      )
      inviato = !(inv.errors?.length || inv.data?.draftOrderInvoiceSend?.userErrors?.length)
    }
    return {
      ok: true,
      bozzaId: bozza.id,
      linkPagamento: bozza.invoiceUrl ?? '',
      ordineNumero: '',
      inviato,
    }
  }

  // Già pagato: la bozza si chiude e diventa un ordine pagato.
  const chiusa = await graphql<{
    data?: {
      draftOrderComplete?: {
        draftOrder?: { order?: { name: string } | null } | null
        userErrors?: { message: string }[]
      }
    }
    errors?: { message: string }[]
  }>(
    n,
    t,
    `mutation Chiudi($id: ID!) {
      draftOrderComplete(id: $id) {
        draftOrder { order { name } }
        userErrors { message }
      }
    }`,
    { id: bozza.id }
  )
  const erroreChiudi =
    chiusa.errors?.[0]?.message || chiusa.data?.draftOrderComplete?.userErrors?.[0]?.message
  if (erroreChiudi) {
    // ⚠️ La bozza ESISTE anche se la chiusura fallisce: dirlo, altrimenti chi
    // riprova ne crea una seconda e il cliente si vede due ordini.
    return {
      ok: false,
      errore: `Bozza creata (${bozza.name}) ma non chiusa: ${erroreChiudi}. Finiscila da Shopify, non rifarla da qui.`,
    }
  }
  return {
    ok: true,
    bozzaId: bozza.id,
    linkPagamento: '',
    ordineNumero: chiusa.data?.draftOrderComplete?.draftOrder?.order?.name ?? '',
    inviato: false,
  }
}

export type SpedizioneNegozio = { titolo: string; prezzo: number; usata: number }

/**
 * Le voci di spedizione **che quel negozio usa davvero**, dai suoi ordini
 * recenti.
 *
 * ⚠️⚠️ NON SI INVENTANO E NON SI CONDIVIDONO FRA I MARCHI: misurato il
 * 19/08/2026 sugli ultimi 60 ordini di ciascuno — Deluxy usa «Consegna in
 * Giacca, Cravatta e Guanti Bianchi» (15 €) e «Consegna Deluxy» (25 €), Cake
 * «Consegna Standard» (10 €), Flowers «Consegna Sempre Gratuita» (0 €).
 * Proporre «Consegna Deluxy» su un ordine Cake vorrebbe dire fatturare al
 * cliente un servizio che quel marchio non fa.
 *
 * Si leggono dagli ordini e non da una tabella nostra perché il listino cambia
 * senza avvisarci: una tabella scritta oggi sarebbe falsa fra un mese, e
 * nessuno se ne accorgerebbe.
 */
export async function spedizioniDelNegozio(negozioId: string): Promise<SpedizioneNegozio[]> {
  const n = await negozio(negozioId)
  if (!n) return []
  const t = await token(n)
  if (!t) return []
  const d = await graphql<{
    data?: {
      orders?: {
        edges?: {
          node: {
            shippingLine?: {
              title?: string
              originalPriceSet?: { shopMoney?: { amount?: string } }
            } | null
          }
        }[]
      }
    }
  }>(
    n,
    t,
    `{ orders(first: 60, sortKey: CREATED_AT, reverse: true) {
        edges { node { shippingLine { title originalPriceSet { shopMoney { amount } } } } }
      } }`
  )
  const conta = new Map<string, SpedizioneNegozio>()
  for (const e of d.data?.orders?.edges ?? []) {
    const s = e.node.shippingLine
    if (!s?.title) continue
    const prezzo = Number(s.originalPriceSet?.shopMoney?.amount ?? 0) || 0
    const chiave = `${s.title}|${prezzo}`
    const gia = conta.get(chiave)
    if (gia) gia.usata++
    else conta.set(chiave, { titolo: s.title, prezzo, usata: 1 })
  }
  // Le più usate davanti: la prima è quella che il negozio mette quasi sempre.
  return [...conta.values()].sort((a, b) => b.usata - a.usata).slice(0, 8)
}

export type ClienteTrovato = {
  nome: string
  cognome: string
  email: string
  telefono: string
  indirizzo: string
  note: string
  cap: string
  citta: string
  provincia: string
  paese: string
  ordini: number
}

/**
 * I clienti già registrati in quel negozio.
 *
 * ⚠️ Si cerca DENTRO IL NEGOZIO scelto, non «fra i clienti Deluxy»: i tre
 * negozi hanno anagrafiche separate su Shopify, e un indirizzo preso da un
 * altro negozio sarebbe un dato che quel negozio non ha mai visto.
 *
 * ⚠️ Si porta indietro anche l'indirizzo predefinito: è il motivo per cui si
 * richiama un cliente — non ridigitare via, CAP e città al telefono, dove si
 * sbaglia una cifra e il valet suona alla porta sbagliata.
 */
export async function cercaClienti(negozioId: string, q: string): Promise<ClienteTrovato[]> {
  const pulito = q.trim()
  if (!pulito) return []
  const n = await negozio(negozioId)
  if (!n) return []
  const t = await token(n)
  if (!t) return []
  const d = await graphql<{
    data?: {
      customers?: {
        edges?: {
          node: {
            firstName?: string | null
            lastName?: string | null
            email?: string | null
            phone?: string | null
            numberOfOrders?: string | null
            defaultAddress?: {
              address1?: string | null
              address2?: string | null
              zip?: string | null
              city?: string | null
              provinceCode?: string | null
              countryCodeV2?: string | null
              phone?: string | null
            } | null
          }
        }[]
      }
    }
  }>(
    n,
    t,
    `query Clienti($q: String!) {
      customers(first: 8, query: $q) {
        edges { node {
          firstName lastName email phone numberOfOrders
          defaultAddress { address1 address2 zip city provinceCode countryCodeV2 phone }
        } }
      }
    }`,
    { q: pulito }
  )
  return (d.data?.customers?.edges ?? []).map((e) => {
    const c = e.node
    const a = c.defaultAddress
    return {
      nome: c.firstName ?? '',
      cognome: c.lastName ?? '',
      email: c.email ?? '',
      // ⚠️ Il telefono del CLIENTE è spesso vuoto mentre quello dell'indirizzo
      // c'è: è lo stesso numero, e senza questo ripiego si chiederebbe al
      // cliente un dato che abbiamo già.
      telefono: c.phone || a?.phone || '',
      indirizzo: a?.address1 ?? '',
      note: a?.address2 ?? '',
      cap: a?.zip ?? '',
      citta: a?.city ?? '',
      provincia: a?.provinceCode ?? '',
      paese: a?.countryCodeV2 ?? 'IT',
      ordini: Number(c.numberOfOrders ?? 0) || 0,
    }
  })
}

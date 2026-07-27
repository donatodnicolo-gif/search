import { leggiImpostazioni } from './impostazioni'
import { brandRicercaDaNegozio } from './negozi'

// Ponte verso l'app Deluxy Orders, il registro centralizzato degli ordini
// (~14.000, tutto lo storico). Qui teniamo solo gli ultimi 60 giorni scaricati
// da Shopify: per gli ordini più vecchi si interroga Orders invece di
// duplicarne l'archivio.
//
// Configurazione in Impostazioni: ordersUrl + ordersApiKey (cifrata).

const BASE_DEFAULT = 'https://deluxy-orders.vercel.app'

export type OrdineArchivio = {
  id: string
  // gid Shopify dell'ordine: è la chiave stabile con cui deduplichiamo, la
  // stessa che avevano gli ordini scaricati prima direttamente da Shopify.
  orderId: string
  brand: string
  // il brand tradotto per l'app Ricerca fornitori: Orders lo chiama "Flowers",
  // lì si chiama "deluxyflowers.com"
  brandRicerca: string
  numero: string
  data: string
  totale: number
  valuta: string
  clienteNome: string
  telefono: string
  email: string
  citta: string
  // Paese di spedizione (ISO 2 lettere): serve a scegliere in che lingua
  // scrivere al cliente (src/lib/lingua.ts).
  paese: string
  dataConsegna: string | null
  fasciaConsegna: string
  statoChiave: string
  statoNome: string
  // Da che tipo di cliente arriva l'ordine, secondo il registro Orders:
  // privato | azienda | horeca | eventi | rivenditore. Vuoto = Orders non sa
  // dirlo (ordine senza email, telefono né nome: non si tira a indovinare).
  clienteTipo: string
  // Se quel tipo l'ha deciso un operatore ("manuale") o è dedotto dal nome
  // dell'acquirente ("dedotta"). Una deduzione si può smentire, una scelta no.
  clienteTipoDa: string
  // Quante volte il cliente aveva già comprato PRIMA di questo ordine, e che
  // numero ha questo ordine per lui. Li conta Orders sulla storia completa: la
  // nostra copia è di due mesi e non basterebbe. `null` = non calcolato, o
  // cliente non riconoscibile — che non vuol dire «è il suo primo ordine».
  clienteOrdiniPrima: number | null
  clienteNumeroOrdine: number | null
}

export type EsitoArchivio =
  | { stato: 'ok'; totale: number; ordini: OrdineArchivio[] }
  | { stato: 'non-configurato' }
  | { stato: 'errore'; messaggio: string }

type OrdineOrders = {
  id: string
  orderId?: string
  brand: string
  numero: string
  data: string
  totale: number
  valuta: string
  cliente?: {
    nome?: string | null
    email?: string | null
    telefono?: string | null
    tipo?: string | null
    tipoDa?: string | null
    // Ordinali sulla storia completa del cliente (Orders li calcola su ~14.000
    // ordini). Facoltativi: una versione più vecchia di Orders non li manda.
    ordiniPrima?: number | null
    numeroOrdine?: number | null
  }
  spedizione?: { citta?: string | null; paese?: string | null }
  consegna?: { data?: string | null; fascia?: string | null }
  classificazione?: { stato?: { chiave?: string; nome?: string } | null }
}

function normalizza(o: OrdineOrders): OrdineArchivio {
  return {
    id: o.id,
    orderId: o.orderId || o.id,
    brand: o.brand,
    brandRicerca: brandRicercaDaNegozio(o.brand, '') || o.brand,
    numero: o.numero,
    data: o.data,
    totale: o.totale,
    valuta: o.valuta,
    clienteNome: o.cliente?.nome ?? '',
    telefono: o.cliente?.telefono ?? '',
    email: o.cliente?.email ?? '',
    citta: o.spedizione?.citta ?? '',
    paese: o.spedizione?.paese ?? '',
    dataConsegna: o.consegna?.data ?? null,
    fasciaConsegna: o.consegna?.fascia ?? '',
    statoChiave: o.classificazione?.stato?.chiave ?? '',
    statoNome: o.classificazione?.stato?.nome ?? '',
    clienteTipo: o.cliente?.tipo ?? '',
    clienteTipoDa: o.cliente?.tipoDa ?? '',
    // `?? null` e non `?? 0`: zero vuol dire «primo ordine», null vuol dire
    // «non lo sappiamo». Confonderli farebbe passare per clienti nuovi tutti
    // quelli che Orders non riesce a riconoscere.
    clienteOrdiniPrima: o.cliente?.ordiniPrima ?? null,
    clienteNumeroOrdine: o.cliente?.numeroOrdine ?? null,
  }
}

/** Configurazione del ponte verso Orders (URL + chiave), o null se manca. */
async function configOrders(): Promise<{ base: string; chiave: string } | null> {
  const c = await leggiImpostazioni(['ordersUrl', 'ordersApiKey'])
  if (!c.ordersApiKey) return null
  return { base: (c.ordersUrl || BASE_DEFAULT).replace(/\/$/, ''), chiave: c.ordersApiKey }
}

/**
 * Scarica gli ordini recenti dal registro Deluxy Orders (paginato).
 * È la sorgente degli ordini: Orders sincronizza Shopify, noi leggiamo da lui —
 * così la classificazione Deluxy è la stessa in tutte le app.
 */
export async function scaricaOrdiniDaOrders(
  giorni = 60,
  maxPagine = 30
): Promise<OrdineArchivio[]> {
  const c = await configOrders()
  if (!c) throw new Error('App Ordini non configurata: URL e chiave in Impostazioni.')

  const da = new Date(Date.now() - giorni * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const out: OrdineArchivio[] = []

  for (let page = 1; page <= maxPagine; page++) {
    const p = new URLSearchParams({ da, page: String(page), limit: '200' })
    const res = await fetch(`${c.base}/api/v1/ordini?${p}`, {
      headers: { 'x-api-key': c.chiave },
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    })
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('Chiave API di Orders non valida (Impostazioni).')
      }
      throw new Error(`L'app Ordini ha risposto ${res.status}.`)
    }
    const corpo = (await res.json().catch(() => ({}))) as {
      ordini?: OrdineOrders[]
      pagine?: number
    }
    const ordini = corpo.ordini ?? []
    out.push(...ordini.map(normalizza))
    if (ordini.length === 0 || page >= (corpo.pagine ?? 1)) break
  }

  return out
}

/**
 * La pipeline degli stati di Orders (chiave → nome e colore): serve a colorare
 * il calendario con gli stessi colori dell'app Ordini.
 */
export async function statiDaOrders(): Promise<Map<string, { nome: string; colore: string }>> {
  const c = await configOrders()
  const mappa = new Map<string, { nome: string; colore: string }>()
  if (!c) return mappa
  try {
    const res = await fetch(`${c.base}/api/v1/stati`, {
      headers: { 'x-api-key': c.chiave },
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    })
    if (!res.ok) return mappa
    const corpo = (await res.json()) as {
      stati?: { chiave: string; nome: string; colore: string }[]
    }
    for (const s of corpo.stati ?? []) mappa.set(s.chiave, { nome: s.nome, colore: s.colore })
  } catch {
    // se non risponde, il calendario usa un colore neutro
  }
  return mappa
}

/** Cerca negli ordini storici di Deluxy Orders. */
export async function cercaInArchivio(q: string, limit = 50): Promise<EsitoArchivio> {
  const c = await leggiImpostazioni(['ordersUrl', 'ordersApiKey'])
  if (!c.ordersApiKey) return { stato: 'non-configurato' }
  const base = (c.ordersUrl || BASE_DEFAULT).replace(/\/$/, '')

  const p = new URLSearchParams({ q, limit: String(limit) })
  let res: Response
  try {
    res = await fetch(`${base}/api/v1/ordini?${p}`, {
      headers: { 'x-api-key': c.ordersApiKey },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
  } catch (e) {
    const err = e as Error
    return {
      stato: 'errore',
      messaggio:
        err.name === 'TimeoutError'
          ? "L'app Ordini non ha risposto in tempo."
          : `App Ordini non raggiungibile: ${err.message}`,
    }
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return { stato: 'errore', messaggio: 'Chiave API di Orders non valida (Impostazioni).' }
    }
    return { stato: 'errore', messaggio: `L'app Ordini ha risposto ${res.status}.` }
  }

  const corpo = (await res.json().catch(() => ({}))) as {
    totale?: number
    ordini?: OrdineOrders[]
  }

  return {
    stato: 'ok',
    totale: corpo.totale ?? 0,
    ordini: (corpo.ordini ?? []).map(normalizza),
  }
}

/**
 * Quando Orders ha scaricato l'ultima volta da Shopify (sonda pubblica, nessuna
 * chiave). Serve a mostrare tutta la catena Shopify → Orders → qui: se Orders è
 * fermo, aggiornarsi da lui ogni quarto d'ora non porta niente di nuovo, e
 * bisogna poterlo vedere invece di cercare un ordine che non arriverà.
 *
 * Non fallisce mai in modo rumoroso: se non risponde torna `null` e la pagina
 * semplicemente non mostra quel pezzo.
 */
export async function ultimoImportOrders(): Promise<string | null> {
  const c = await leggiImpostazioni(['ordersUrl'])
  const base = (c.ordersUrl || BASE_DEFAULT).replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/api/v1/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const d = (await res.json().catch(() => ({}))) as { ultimoImport?: string | null }
    return d.ultimoImport ?? null
  } catch {
    return null
  }
}

/** Una riga dell'ordine: il prodotto, con la sua foto se Shopify ce l'ha. */
export type RigaOrdine = {
  titolo: string
  variante: string
  sku: string
  quantita: number
  prezzo: number
  /** Personalizzazioni del cliente ("Scritta sulla torta: Sofia"). */
  proprieta: string[]
  /** URL della foto sul CDN Shopify, o '' se il prodotto non ne ha. */
  immagine: string
}

/**
 * Le righe di un ordine (prodotti + foto), chieste a Orders per numero.
 *
 * Non le teniamo in copia: servono solo quando si apre il dettaglio di un
 * ordine, e duplicare qui il catalogo dei prodotti vorrebbe dire tenerlo
 * aggiornato — mentre Orders lo ha già e lo sincronizza con Shopify.
 *
 * Si cerca per NUMERO (di Orders non conserviamo il suo id interno) e fra i
 * risultati si riconosce l'ordine dal **gid Shopify**: è la stessa chiave con cui
 * il sync deduplica, quindi è esatta. Serve perché lo stesso numero esiste su più
 * negozi — «#1733» c'è sia su Cake sia su Deluxy — e mostrare i prodotti
 * dell'ordine sbagliato sarebbe peggio che non mostrarne nessuno.
 */
// Il DESTINATARIO e dove va la consegna. Non è in copia qui: nel Customer
// Service l'ordine tiene i dati di CHI COMPRA (mittente), non di chi riceve —
// e nei regali sono quasi sempre due persone diverse. Si chiedono a Orders
// insieme alle righe, nella stessa chiamata che si faceva già.
export type SpedizioneOrdine = {
  nome: string
  indirizzo: string
  citta: string
  cap: string
  provincia: string
  paese: string
}

export async function righeOrdineDaOrders(
  numero: string,
  shopifyId = ''
): Promise<
  | { stato: 'ok'; righe: RigaOrdine[]; spedizione: SpedizioneOrdine | null; biglietto: string }
  | { stato: 'non-configurato' }
  | { stato: 'errore'; messaggio: string }
> {
  const c = await configOrders()
  if (!c) return { stato: 'non-configurato' }

  const nudo = numero.replace(/^#/, '').trim()
  if (!nudo) return { stato: 'errore', messaggio: 'Ordine senza numero.' }

  try {
    const p = new URLSearchParams({ q: nudo, limit: '20' })
    const res = await fetch(`${c.base}/api/v1/ordini?${p}`, {
      headers: { 'x-api-key': c.chiave },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { stato: 'errore', messaggio: 'Chiave API di Orders non valida (Impostazioni).' }
      }
      return { stato: 'errore', messaggio: `L'app Ordini ha risposto ${res.status}.` }
    }
    const corpo = (await res.json().catch(() => ({}))) as {
      ordini?: {
        numero?: string
        brand?: string
        orderId?: string
        biglietto?: string | null
        spedizione?: {
          nome?: string | null
          indirizzo?: string | null
          citta?: string | null
          cap?: string | null
          provincia?: string | null
          paese?: string | null
        } | null
        righe?: {
          titolo?: string
          variante?: string | null
          sku?: string | null
          quantita?: number
          prezzo?: number
          proprieta?: string[]
          immagine?: string | null
        }[]
      }[]
    }

    const candidati = corpo.ordini ?? []
    const perNumero = candidati.filter((o) => (o.numero ?? '').replace(/^#/, '') === nudo)
    // Il gid Shopify identifica l'ordine senza ambiguità: è la chiave su cui il
    // sync fa l'upsert. Solo se non ce l'abbiamo (ordini vecchi) si accetta
    // l'unico risultato col numero giusto.
    const scelto =
      (shopifyId ? perNumero.find((o) => o.orderId === shopifyId) : null) ??
      (perNumero.length === 1 ? perNumero[0] : null)

    if (!scelto) {
      return {
        stato: 'errore',
        messaggio: perNumero.length
          ? `Il numero ${numero} esiste su più negozi: non so quale mostrare.`
          : `L'ordine ${numero} non è nel registro Ordini.`,
      }
    }

    const sp = scelto.spedizione
    return {
      stato: 'ok',
      spedizione: sp
        ? {
            nome: sp.nome ?? '',
            indirizzo: sp.indirizzo ?? '',
            citta: sp.citta ?? '',
            cap: sp.cap ?? '',
            provincia: sp.provincia ?? '',
            paese: sp.paese ?? '',
          }
        : null,
      biglietto: scelto.biglietto ?? '',
      righe: (scelto.righe ?? []).map((r) => ({
        titolo: r.titolo ?? '',
        variante: r.variante ?? '',
        sku: r.sku ?? '',
        quantita: r.quantita ?? 1,
        prezzo: r.prezzo ?? 0,
        proprieta: r.proprieta ?? [],
        immagine: r.immagine ?? '',
      })),
    }
  } catch (e) {
    const err = e as Error
    return {
      stato: 'errore',
      messaggio:
        err.name === 'TimeoutError'
          ? "L'app Ordini non ha risposto in tempo."
          : `App Ordini non raggiungibile: ${err.message}`,
    }
  }
}

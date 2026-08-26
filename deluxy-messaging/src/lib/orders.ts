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
  /** Governo del giro: "manuale" = riservato a noi, l'automatico lo salta. */
  smistamento: string
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
  // C'è una nota del cliente su questo ordine (dentro c'è il biglietto)?
  // Solo il sì/no: il testo resta in Orders e lo chiede il dettaglio.
  haBiglietto: boolean
  // Come sta il PAGAMENTO secondo Shopify: PAID | PENDING | REFUNDED |
  // PARTIALLY_REFUNDED | VOIDED… Vuoto = Orders non l'ha mandato.
  statoPagamento: string
  // Il rischio frode: livello (NONE | LOW | MEDIUM | HIGH) e cosa dice di fare
  // Shopify (ACCEPT | INVESTIGATE | CANCEL). Vuoti = non lo sappiamo — che è
  // diverso da «nessun rischio», e per questo non si mostra niente.
  rischioLivello: string
  rischioRaccomandazione: string
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
  smistamento?: string | null
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
  // Attributo «biglietto» dell'ordine: c'è di rado (71 ordini su 800). Il
  // testo vero sta quasi sempre in `shopify.note`.
  biglietto?: string | null
  shopify?: {
    note?: string | null
    financialStatus?: string | null
    rischio?: {
      livello?: string | null
      raccomandazione?: string | null
      motivi?: string[] | null
    } | null
  } | null
  spedizione?: { citta?: string | null; paese?: string | null }
  consegna?: { data?: string | null; fascia?: string | null }
  classificazione?: { stato?: { chiave?: string; nome?: string } | null }
}

/**
 * Il testo del biglietto: la NOTA dell'ordine, più l'attributo «biglietto» se
 * contiene qualcosa di diverso.
 *
 * ⚠️ Sono due campi e non uno, e la fonte principale è la nota — misurato su
 * 800 ordini: la nota c'è su 680 (85%), l'attributo su 71, e dei 70 con
 * entrambi 67 hanno testo identico. Prima leggevamo solo l'attributo, e nove
 * ordini su dieci risultavano «senza biglietto» pur avendone uno scritto.
 *
 * Quando i due testi differiscono si mostrano ENTRAMBI: uno dei due non è la
 * versione buona dell'altro, e scegliere vorrebbe dire buttare via del testo
 * che il cliente ha scritto.
 */
export function testoBiglietto(
  nota: string | null | undefined,
  attributo: string | null | undefined
): string {
  const n = (nota ?? '').trim()
  const a = (attributo ?? '').trim()
  if (!n) return a
  if (!a || a === n) return n
  // Contenuto l'uno nell'altro: si tiene il più completo, non si duplica.
  if (n.includes(a)) return n
  if (a.includes(n)) return a
  return `${n}

— altre note dell'ordine —
${a}`
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
    smistamento: o.smistamento ?? '',
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
    // Il biglietto sta nelle NOTE dell'ordine (85% degli ordini), non
    // nell'attributo omonimo (9%): vedi testoBiglietto(). Si guarda solo se c'è
    // o non c'è — DENTRO al testo non si entra, perché contiene anche indirizzi
    // e telefoni e interpretarlo è la trappola già pagata.
    haBiglietto: Boolean(testoBiglietto(o.shopify?.note, o.biglietto)),
    statoPagamento: o.shopify?.financialStatus ?? '',
    rischioLivello: o.shopify?.rischio?.livello ?? '',
    rischioRaccomandazione: o.shopify?.rischio?.raccomandazione ?? '',
  }
}

/** Configurazione del ponte verso Orders (URL + chiave), o null se manca.
 *  Prima le variabili d'ambiente (`ORDERS_URL`/`ORDERS_API_KEY`, standard
 *  Deluxy §4.4: ispezionabili dal pannello Vercel e ruotabili senza toccare il
 *  database), poi le Impostazioni come ripiego per chi le aveva già lì. */
async function configOrders(): Promise<{ base: string; chiave: string } | null> {
  const envUrl = (process.env.ORDERS_URL ?? '').trim()
  const envChiave = (process.env.ORDERS_API_KEY ?? '').trim()
  if (envChiave) return { base: (envUrl || BASE_DEFAULT).replace(/\/$/, ''), chiave: envChiave }
  const c = await leggiImpostazioni(['ordersUrl', 'ordersApiKey'])
  if (!c.ordersApiKey) return null
  return { base: (envUrl || c.ordersUrl || BASE_DEFAULT).replace(/\/$/, ''), chiave: c.ordersApiKey }
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

export type OrdineAnnullato = { orderId: string; annullatoIl: string | null }

/**
 * Gli ordini ANNULLATI su Shopify da `giorni` a oggi, dal canale dedicato di
 * Orders (`?annullatiDa=`). Serve al ritiro dello specchio: Orders esclude gli
 * annullati dagli elenchi normali, quindi senza questa chiamata un annullamento
 * resterebbe invisibile qui per sempre. Non solleva mai: il ritiro è un
 * contorno della sync, e un elenco vuoto per errore di rete si recupera al
 * giro dopo.
 */
export async function annullatiDaOrders(giorni = 60, maxPagine = 5): Promise<OrdineAnnullato[]> {
  const c = await configOrders()
  if (!c) return []
  const da = new Date(Date.now() - giorni * 24 * 60 * 60 * 1000).toISOString()
  const out: OrdineAnnullato[] = []
  try {
    for (let page = 1; page <= maxPagine; page++) {
      const p = new URLSearchParams({ annullatiDa: da, page: String(page), limit: '200' })
      const res = await fetch(`${c.base}/api/v1/ordini?${p}`, {
        headers: { 'x-api-key': c.chiave },
        signal: AbortSignal.timeout(20000),
        cache: 'no-store',
      })
      if (!res.ok) return out
      const corpo = (await res.json().catch(() => ({}))) as {
        ordini?: { orderId?: string; shopify?: { annullatoIl?: string | null } }[]
        pagine?: number
      }
      const righe = corpo.ordini ?? []
      for (const o of righe) {
        if (o.orderId) out.push({ orderId: o.orderId, annullatoIl: o.shopify?.annullatoIl ?? null })
      }
      if (righe.length === 0 || page >= (corpo.pagine ?? 1)) break
    }
  } catch {
    // rete o timeout: si riprova al prossimo giro di sync
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
  const c = await configOrders()
  if (!c) return { stato: 'non-configurato' }
  const base = c.base

  const p = new URLSearchParams({ q, limit: String(limit) })
  let res: Response
  try {
    res = await fetch(`${base}/api/v1/ordini?${p}`, {
      headers: { 'x-api-key': c.chiave },
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
  const envUrl = (process.env.ORDERS_URL ?? '').trim()
  const c = envUrl ? { ordersUrl: envUrl } : await leggiImpostazioni(['ordersUrl'])
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

/**
 * Un ordine come lo manda Orders, con i soli campi che ci servono. Il registro
 * ne espone molti di più (marketing, margini, classificazioni): qui si legge il
 * minimo, così una loro aggiunta non ci obbliga a toccare niente.
 */
export type OrdineOrdersRaw = {
  /**
   * L'id INTERNO di Orders (cuid), diverso dal gid Shopify (`orderId`) e dal
   * nostro. ⚠️ È quello che vuole la sua rotta `/api/v1/ordini/<id>` quando le
   * si propone qualcosa: passarle il gid darebbe un 404 che sembra «ordine
   * inesistente» mentre l'ordine c'è.
   */
  id?: string
  numero?: string
  brand?: string
  orderId?: string
  data?: string
  totale?: number
  valuta?: string
  biglietto?: string | null
  // ⚠️ LA NOTA È IL CAMPO GIUSTO. Misurato su 800 ordini: `note` ha contenuto su
  // 680 (85%), `biglietto` su 71 — e dei 70 che hanno entrambi, 67 sono lo
  // stesso testo. Il biglietto lo scrive il cliente nelle NOTE dell'ordine;
  // `biglietto` è un attributo che si riempie di rado. Leggere solo quello
  // lasciava senza testo 9 ordini su 10.
  shopify?: { note?: string | null; financialStatus?: string | null } | null
  cliente?: {
    nome?: string | null
    email?: string | null
    telefono?: string | null
    tipo?: string | null
    tipoDa?: string | null
  } | null
  consegna?: { data?: string | null; fascia?: string | null } | null
  classificazione?: { stato?: { chiave?: string; nome?: string } | null } | null
  /**
   * I SOLDI dell'ordine, come li calcola **Orders**.
   *
   * ⚠️⚠️ Il margine si legge da qui e NON si rifà in casa. Lo Standard Deluxy
   * §7.4 lo dice esplicitamente — «il margine si calcola SOLO in Orders» — e la
   * ragione è la stessa della quota fornitore: una formula ricopiata resta al
   * valore vecchio il giorno che la cambiano là, e nessuna delle due schermate
   * dà errore. Direbbero solo due numeri diversi sulla stessa cosa.
   *
   * ⚠️ `costo` e `margine` sono `null` quando il costo del fornitore non si sa —
   * e allora si scrive «non calcolabile», mai zero: uno zero verrebbe letto come
   * «nessun margine», che è un'altra cosa (§7.3 punto 6).
   */
  controllo?: {
    costo?: number | null
    costoFornitore?: string | null
    costoIl?: string | null
    /** manuale | causale | finance: chi ha deciso quel costo. */
    costoDa?: string | null
    margine?: number | null
  } | null
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
}

/**
 * UN ordine preciso, chiesto a Orders per numero.
 *
 * Sta a parte perché lo usano in due: il dettaglio di un ordine che abbiamo in
 * casa (a cui servono solo i prodotti) e il dettaglio di un ordine che esiste
 * **solo** nell'archivio (a cui serve tutto). Erano la stessa chiamata scritta
 * due volte, e due copie della regola con cui si sceglie l'ordine giusto sono
 * il modo migliore per farle divergere.
 */
export async function ordineDaOrders(
  numero: string,
  shopifyId = ''
): Promise<
  | { stato: 'ok'; ordine: OrdineOrdersRaw }
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
    const corpo = (await res.json().catch(() => ({}))) as { ordini?: OrdineOrdersRaw[] }

    const candidati = corpo.ordini ?? []
    const perNumero = candidati.filter((o) => (o.numero ?? '').replace(/^#/, '') === nudo)
    // Il gid Shopify identifica l'ordine senza ambiguità: è la chiave su cui il
    // sync fa l'upsert. Solo se non ce l'abbiamo (ordini vecchi) si accetta
    // l'unico risultato col numero giusto.
    //
    // ⚠️⚠️ IL RIPIEGO VALE SOLO SE L'IDENTITÀ NON C'È. Prima le due righe erano
    // in `??`, e `??` scatta anche quando il primo ramo è stato **provato e ha
    // fallito**: chiamando con uno `shopifyId` che in questa pagina di risultati
    // non c'è, si ricadeva sull'unico numero uguale e si tornava **un ordine di
    // un altro negozio**, in silenzio. Misurato su Orders: `q=2705` dà 26
    // candidati e la pagina si ferma a 20 — #2705/Flowers entra, #2705/deluxy.it
    // no, ed esistono tutti e due. Chi chiedeva il secondo si prendeva il primo,
    // col suo margine.
    //
    // ⚠️ Con lo `shopifyId` in mano, «non l'ho trovato» è la risposta giusta: la
    // dà il ramo qui sotto e manda a controllare, invece di far scrivere il
    // costo sull'ordine di qualcun altro.
    const scelto = shopifyId
      ? (perNumero.find((o) => o.orderId === shopifyId) ?? null)
      : perNumero.length === 1
        ? perNumero[0]
        : null

    if (!scelto) {
      return {
        stato: 'errore',
        messaggio: perNumero.length
          ? `Il numero ${numero} esiste su più negozi: non so quale mostrare.`
          : `L'ordine ${numero} non è nel registro Ordini.`,
      }
    }

    return { stato: 'ok', ordine: scelto }
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

export async function righeOrdineDaOrders(
  numero: string,
  shopifyId = ''
): Promise<
  | { stato: 'ok'; righe: RigaOrdine[]; spedizione: SpedizioneOrdine | null; biglietto: string }
  | { stato: 'non-configurato' }
  | { stato: 'errore'; messaggio: string }
> {
  const esito = await ordineDaOrders(numero, shopifyId)
  if (esito.stato !== 'ok') return esito
  return { stato: 'ok', ...pezziOrdine(esito.ordine) }
}

/** Prodotti, destinatario e biglietto di un ordine grezzo di Orders. */
export function pezziOrdine(o: OrdineOrdersRaw): {
  righe: RigaOrdine[]
  spedizione: SpedizioneOrdine | null
  biglietto: string
} {
  const sp = o.spedizione
  return {
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
    biglietto: testoBiglietto(o.shopify?.note, o.biglietto),
    righe: (o.righe ?? []).map((r) => ({
      titolo: r.titolo ?? '',
      variante: r.variante ?? '',
      sku: r.sku ?? '',
      quantita: r.quantita ?? 1,
      prezzo: r.prezzo ?? 0,
      proprieta: r.proprieta ?? [],
      immagine: r.immagine ?? '',
    })),
  }
}

/**
 * Gli ordini di UN cliente, con il destinatario.
 *
 * Serve alla scheda cliente e non poteva usare `cercaInArchivio`: quella
 * normalizza e butta via `spedizione.nome`, che per un'azienda di regali è il
 * dato che conta di più — chi ordina e chi riceve sono due persone diverse, e
 * sapere che manda sempre alla stessa è ciò che distingue un cliente da un
 * conoscente.
 */
export type OrdineCliente = {
  numero: string
  brand: string
  data: string
  totale: number
  valuta: string
  dataConsegna: string | null
  destinatario: string
  citta: string
}

export async function ordiniClienteDaOrders(
  q: string,
  limit = 100
): Promise<{ stato: 'ok'; ordini: OrdineCliente[] } | { stato: 'errore'; messaggio: string }> {
  const c = await configOrders()
  if (!c) return { stato: 'errore', messaggio: 'app Ordini non configurata' }
  try {
    const p = new URLSearchParams({ q, limit: String(limit) })
    const res = await fetch(`${c.base}/api/v1/ordini?${p}`, {
      headers: { 'x-api-key': c.chiave },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
    if (!res.ok) return { stato: 'errore', messaggio: `Orders ha risposto ${res.status}` }
    const corpo = (await res.json().catch(() => ({}))) as {
      ordini?: {
        numero?: string
        brand?: string
        data?: string
        totale?: number
        valuta?: string
        consegna?: { data?: string | null }
        spedizione?: { nome?: string | null; citta?: string | null }
      }[]
    }
    return {
      stato: 'ok',
      ordini: (corpo.ordini ?? []).map((o) => ({
        numero: o.numero ?? '',
        brand: o.brand ?? '',
        data: o.data ?? '',
        totale: o.totale ?? 0,
        valuta: o.valuta ?? 'EUR',
        dataConsegna: o.consegna?.data ?? null,
        destinatario: (o.spedizione?.nome ?? '').trim(),
        citta: (o.spedizione?.citta ?? '').trim(),
      })),
    }
  } catch (e) {
    return { stato: 'errore', messaggio: (e as Error).message }
  }
}

// ── LA QUOTA DEL FORNITORE ──
//
// ⚠️⚠️ **La regola non è nostra e non va ricopiata qui.** La percentuale che
// Deluxy si aspetta di pagare al fornitore vive in **Deluxy Orders**
// (impostazione `controllo.quotaFornitore`, di norma **60%**), perché è là che
// si controllano i pagamenti ai fornitori. Scriverla nel nostro codice
// vorrebbe dire che il giorno in cui la cambiano lì, questa schermata continua
// a mostrare il vecchio numero — e due schermate che dicono due percentuali
// diverse sono peggio di una schermata che non la dice.
//
// ⚠️ Se Orders non risponde, **non si inventa il 60%**: si torna `null` e la
// scheda non mostra l'importo. Un numero indicativo va bene; un numero
// indicativo sbagliato no.

export type QuotaFornitore = {
  /** La percentuale del totale che ci si aspetta di pagare al fornitore. */
  quota: number
  /** Quanto fa su questo ordine, se il totale è stato passato. */
  atteso?: number
  /** Dove si cambia, da dire a schermo: la regola non si tocca da qui. */
  dove: string
}

/** Legge la quota da Orders. `null` quando non si sa: allora non si mostra niente. */
export async function leggiQuotaFornitore(totale?: number): Promise<QuotaFornitore | null> {
  const c = await configOrders()
  if (!c) return null
  try {
    const p = totale && totale > 0 ? `?totale=${encodeURIComponent(String(totale))}` : ''
    const res = await fetch(`${c.base}/api/v1/quota-fornitore${p}`, {
      headers: { 'x-api-key': c.chiave },
      // ⚠️ Corto: sta nel caricamento della scheda di un ordine. Meglio una
      // riga in meno che una scheda che si apre in ritardo.
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const d = (await res.json()) as { quota?: number; atteso?: number; dove?: string }
    if (typeof d.quota !== 'number' || !(d.quota > 0 && d.quota < 100)) return null
    return {
      quota: d.quota,
      atteso: typeof d.atteso === 'number' ? d.atteso : undefined,
      dove: d.dove || 'Deluxy Orders → Impostazioni',
    }
  } catch {
    return null
  }
}

/**
 * I SOLDI di un ordine, chiesti a Orders: costo del fornitore e MARGINE.
 *
 * ⚠️⚠️ Esiste per NON rifare il conto in casa. Lo Standard Deluxy §7.4 dice che
 * il margine si calcola solo in Orders, e §7.3 che le regole economiche vivono
 * in un posto solo: una formula ricopiata resta al valore vecchio il giorno che
 * la cambiano là, e nessuna delle due schermate dà errore — direbbero solo due
 * numeri diversi sulla stessa cosa.
 *
 * ⚠️ `null` NON è zero: quando Orders non risponde, o il costo del fornitore
 * non lo sa, il chiamante deve scrivere «non calcolabile». È la regola §7.3.6.
 */
export type SoldiOrdine = {
  totale: number
  /** Quanto risulta pagato al fornitore, secondo Orders. `null` = non lo sa. */
  costo: number | null
  /** Chi lo prepara, secondo Orders. */
  fornitore: string
  /** Il margine, calcolato DA ORDERS. `null` = non calcolabile. */
  margine: number | null
  /** manuale | causale | finance — chi ha deciso quel costo. */
  costoDa: string
}

export async function soldiOrdineDaOrders(
  numero: string,
  shopifyId = ''
): Promise<SoldiOrdine | null> {
  const esito = await ordineDaOrders(numero, shopifyId)
  if (esito.stato !== 'ok') return null
  const c = esito.ordine.controllo ?? null
  return {
    totale: esito.ordine.totale ?? 0,
    costo: typeof c?.costo === 'number' ? c.costo : null,
    fornitore: c?.costoFornitore ?? '',
    margine: typeof c?.margine === 'number' ? c.margine : null,
    costoDa: c?.costoDa ?? '',
  }
}

/**
 * COMUNICA A ORDERS il costo del fornitore deciso qui.
 *
 * ⚠️⚠️ Decisione dell'utente (24/08/2026), che **devia dallo Standard §7.4**
 * («il margine si calcola SOLO in Orders»): il margine lo calcola questa app,
 * perché nasce dal costo che decide questa app, e lo si comunica a Orders. La
 * deviazione è scritta nello standard, come lo standard stesso prescrive.
 *
 * ⚠️ Si manda il COSTO, non il margine: il margine è `totale − costo` e Orders
 * lo fa già da sé. Mandare tutti e due vorrebbe dire due numeri per un fatto
 * solo, e il giorno che divergono nessuno saprebbe quale credere.
 *
 * ⚠️ Un fallimento NON deve far fallire la registrazione qui: il fatto («questo
 * ordine lo prepara Tizio a 80 €») è nostro e vale comunque. Si torna l'errore
 * e lo si mostra, invece di perdere il dato.
 */
/**
 * Dice a Orders se questo ordine può andare nello smistamento automatico della
 * piattaforma o se ce lo teniamo noi ("manuale"). È il GOVERNO del giro
 * (Standard §7.4): l'automatico non scavalca mai il decisore — la piattaforma
 * legge il flag dal registro e salta l'ordine riservato.
 */
export async function comunicaSmistamentoAOrders(
  numero: string,
  shopifyId: string,
  modo: 'manuale' | 'auto'
): Promise<{ ok: true } | { ok: false; messaggio: string }> {
  const c = await configOrders()
  if (!c) return { ok: false, messaggio: 'Orders non è configurato (Impostazioni).' }
  const trovato = await ordineDaOrders(numero, shopifyId)
  if (trovato.stato !== 'ok') {
    return {
      ok: false,
      messaggio: trovato.stato === 'non-configurato' ? 'Orders non è configurato.' : trovato.messaggio,
    }
  }
  try {
    const res = await fetch(`${c.base}/api/v1/ordini/${encodeURIComponent(trovato.ordine.id ?? '')}`, {
      method: 'PATCH',
      headers: { 'x-api-key': c.chiave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ smistamento: modo }),
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    })
    if (res.ok) return { ok: true }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        messaggio:
          'Orders ha rifiutato la scrittura: la chiave di quest’app è in sola lettura. Va abilitata alla scrittura in Orders.',
      }
    }
    const d = (await res.json().catch(() => ({}))) as { errore?: string }
    return { ok: false, messaggio: d.errore || `Orders ha risposto ${res.status}.` }
  } catch (e) {
    const err = e as Error
    return {
      ok: false,
      messaggio:
        err.name === 'TimeoutError' ? 'Orders non ha risposto in tempo.' : `Orders non raggiungibile: ${err.message}`,
    }
  }
}

export async function comunicaCostoAOrders(
  numero: string,
  shopifyId: string,
  costo: number | null,
  fornitore: string
): Promise<{ ok: true } | { ok: false; messaggio: string }> {
  const c = await configOrders()
  if (!c) return { ok: false, messaggio: 'Orders non è configurato (Impostazioni).' }

  // ⚠️ Serve l'id INTERNO di Orders, non il nostro né il gid: la sua rotta è
  // `/api/v1/ordini/<id>`. Lo si ricava cercando l'ordine, che è anche il modo
  // di accorgersi se quel numero là non esiste o è ambiguo.
  const trovato = await ordineDaOrders(numero, shopifyId)
  if (trovato.stato !== 'ok') {
    return {
      ok: false,
      messaggio: trovato.stato === 'non-configurato' ? 'Orders non è configurato.' : trovato.messaggio,
    }
  }

  try {
    const res = await fetch(`${c.base}/api/v1/ordini/${encodeURIComponent(trovato.ordine.id ?? "")}`, {
      method: 'PATCH',
      headers: { 'x-api-key': c.chiave, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        costoFornitore: costo,
        costoFornitoreNome: fornitore || null,
        fornitore: fornitore || null,
        // Il percorso A del giro (Standard §7.4): dare l'ordine a un fornitore
        // in chat SIGNIFICA evaderlo per fornitore diretto — si dice a Orders
        // nella stessa proposta, non in una chiamata a parte. La consegna
        // («consegnataIl») arriverà quando il fornitore conferma; l'evasione
        // via piattaforma la scrive solo il ritiro di Orders, mai noi.
        evasione: 'fornitore_diretto',
      }),
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    })
    if (res.ok) return { ok: true }
    // ⚠️ Il 403 si spiega, invece di dire «non riuscito»: la chiave di
    // quest'app in Orders nasce in sola lettura, e senza il flag di scrittura
    // ogni proposta rimbalza. È una configurazione, non un guasto.
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        messaggio:
          'Orders ha rifiutato la scrittura: la chiave di quest’app è in sola lettura. ' +
          'Va abilitata alla scrittura in Orders.',
      }
    }
    const d = (await res.json().catch(() => ({}))) as { errore?: string }
    return { ok: false, messaggio: d.errore || `Orders ha risposto ${res.status}.` }
  } catch (e) {
    const err = e as Error
    return {
      ok: false,
      messaggio:
        err.name === 'TimeoutError'
          ? 'Orders non ha risposto in tempo.'
          : `Orders non raggiungibile: ${err.message}`,
    }
  }
}

/**
 * COMUNICA A ORDERS lo stato di lavorazione deciso qui.
 *
 * ⚠️⚠️ Il Customer Service è il DECISORE dell'evasione (Standard §7.2): come si
 * lavora un ordine — da_gestire, ricerca_fornitore, in_pagamento, comunicazione,
 * attesa_consegna, gestito — lo decidiamo qui, e Orders lo RICEVE e lo mostra
 * accanto alla sua pipeline (campo `csGestione`). NON è la pipeline di Orders,
 * che è un'altra cosa (registro/controllo): due stati distinti, apposta.
 *
 * ⚠️ Si manda il codice grezzo (`gestito`, non «Gestito»): Orders ha la sua
 * tabella di etichette. Mandare il nome tradotto vorrebbe dire due vocabolari da
 * tenere allineati.
 *
 * ⚠️ Un fallimento NON deve far fallire il cambio di stato locale: il fatto è
 * nostro e vale comunque. Si torna l'esito e, se serve, lo si mostra — una
 * proposta che rimbalza in silenzio farebbe credere che Orders sappia.
 */
export async function comunicaStatoAOrders(
  numero: string,
  shopifyId: string,
  gestione: string,
  gestioneDaNome: string,
  gestioneIl: Date | string | null
): Promise<{ ok: true } | { ok: false; messaggio: string }> {
  const c = await configOrders()
  if (!c) return { ok: false, messaggio: 'Orders non è configurato (Impostazioni).' }

  // ⚠️ Serve l'id INTERNO di Orders (cuid), non il nostro né il gid: la sua rotta
  // è `/api/v1/ordini/<id>`. Lo si ricava cercando l'ordine — che è anche il modo
  // di accorgersi se quel numero là è ambiguo o non esiste.
  const trovato = await ordineDaOrders(numero, shopifyId)
  if (trovato.stato !== 'ok') {
    return {
      ok: false,
      messaggio: trovato.stato === 'non-configurato' ? 'Orders non è configurato.' : trovato.messaggio,
    }
  }

  try {
    const res = await fetch(`${c.base}/api/v1/ordini/${encodeURIComponent(trovato.ordine.id ?? '')}`, {
      method: 'PATCH',
      headers: { 'x-api-key': c.chiave, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csGestione: gestione,
        csGestioneDa: gestioneDaNome || null,
        csGestioneIl: gestioneIl ? new Date(gestioneIl).toISOString() : null,
      }),
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    })
    if (res.ok) return { ok: true }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        messaggio:
          'Orders ha rifiutato la scrittura: la chiave di quest’app è in sola lettura. ' +
          'Va abilitata alla scrittura in Orders.',
      }
    }
    const d = (await res.json().catch(() => ({}))) as { errore?: string }
    return { ok: false, messaggio: d.errore || `Orders ha risposto ${res.status}.` }
  } catch (e) {
    const err = e as Error
    return {
      ok: false,
      messaggio:
        err.name === 'TimeoutError'
          ? 'Orders non ha risposto in tempo.'
          : `Orders non raggiungibile: ${err.message}`,
    }
  }
}

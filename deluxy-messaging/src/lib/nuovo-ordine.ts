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
import { orarioConfigurato } from './orari-negozi'
import { giornoSelezionabile, oggiIso, scriviDataBreve } from './orari-regole'
import { decifra } from './crypto'
import { metodoPerOrdine } from './metodi-pagamento'
import { METODO_CONTRASSEGNO, type Metodo } from './metodi-regole'

const VERSIONE = '2025-01'

/**
 * Uno SKU per una riga scritta a mano: sette cifre.
 *
 * ⚠️ Sette cifre e non un progressivo: un contatore su una tabella condivisa da
 * più app si scontra da solo (due ordini nello stesso secondo prendono lo stesso
 * numero), e qui non c'è nessuna sequenza a cui appoggiarsi — la riga vive su
 * Shopify, non da noi. Con sette cifre lo spazio è dieci milioni: la probabilità
 * di ripetersi su qualche migliaio di righe l'anno è trascurabile, e nessuno di
 * questi codici deve essere unico per legge — deve solo esserci.
 *
 * ⚠️ Mai `0000000`: uno SKU tutto zeri sembra un campo non compilato, che è
 * esattamente quello che si sta cercando di evitare.
 */
export function skuCasuale(): string {
  const n = Math.floor(Math.random() * 9_000_000) + 1_000_000
  return String(n)
}

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

// ── LE TARIFFE DI CONSEGNA, CALCOLATE DAL SITO ──
//
// ⚠️⚠️ Chiesto dall'utente il 28/08/2026: «i valori delle consegne saranno
// aggiornati con le impostazioni del sito? Dovresti prendere tutto da lì». E ha
// ragione, per due motivi provati:
//  1. È la regola Deluxy (Standard §7): le regole economiche NON si ricopiano,
//     si leggono dal proprietario. I prezzi di consegna sono di Shopify.
//  2. Scriverli a mano li sbaglia. Misurato il 28/08/2026: la prima versione
//     aveva Milano 15, Roma/Firenze 25 (giusti) — ma il sito Deluxy ha OTTO
//     zone, e **Bergamo costa 80 €**, un numero che a mano non avrei mai messo.
//
// ⚠️ Non si rifà il calcolo delle zone: lo fa **`draftOrderCalculate`**, che è
// il motore vero del sito. Gli si passa il carrello e l'indirizzo, e torna
// esattamente le tariffe che il cliente vedrebbe alla cassa — col nome giusto
// («Deluxy delivery», «Always Free Shipping»). Se domani cambiano un prezzo sul
// sito, qui cambia da solo, senza toccare niente.

export type TariffaConsegna = {
  /** Il nome della tariffa, come sul sito: «Deluxy delivery», «Standard Delivery». */
  titolo: string
  prezzo: number
  valuta: string
}

export type EsitoTariffe =
  | { stato: 'ok'; tariffe: TariffaConsegna[] }
  | { stato: 'senza-negozio' }
  | { stato: 'errore'; messaggio: string }

/**
 * Le tariffe di consegna che Shopify offre per QUESTO carrello e QUESTO
 * indirizzo. Vuoto (`tariffe: []`) è una risposta vera: il sito non consegna là.
 *
 * ⚠️ Serve l'indirizzo (almeno la provincia o il paese) e almeno una riga: la
 * tariffa dipende dalla zona **e** dal subtotale (certe zone sono gratis oltre
 * una soglia). Senza carrello Shopify non può calcolarla.
 */
export async function tariffeConsegna(
  negozioId: string,
  indirizzo: { citta: string; cap: string; provincia: string; paese: string },
  righe: { variantId?: string; titolo?: string; prezzo?: number; quantita: number }[]
): Promise<EsitoTariffe> {
  const n = await negozio(negozioId)
  if (!n) return { stato: 'senza-negozio' }
  const t = await token(n)
  if (!t) return { stato: 'errore', messaggio: 'Shopify non ha dato un token per questo negozio.' }
  if (!righe.length) return { stato: 'ok', tariffe: [] }

  const input = {
    lineItems: righe.map((r) =>
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
      // ⚠️ Un indirizzo minimo basta al calcolo: la zona la decidono provincia e
      // paese. Nome e via sono di comodo perché Shopify vuole un indirizzo.
      address1: indirizzo.citta.trim() ? 'Consegna' : 'Consegna',
      city: indirizzo.citta.trim() || undefined,
      zip: indirizzo.cap.trim() || undefined,
      provinceCode: indirizzo.provincia.trim() || undefined,
      countryCode: (indirizzo.paese.trim() || 'IT').toUpperCase(),
      firstName: 'Cliente',
      lastName: '.',
    },
  }

  const d = await graphql<{
    data?: {
      draftOrderCalculate?: {
        calculatedDraftOrder?: {
          availableShippingRates?: { title?: string; price?: { amount?: string; currencyCode?: string } }[]
        } | null
        userErrors?: { message: string }[]
      }
    }
    errors?: { message: string }[]
  }>(
    n,
    t,
    `mutation Calcola($input: DraftOrderInput!) {
      draftOrderCalculate(input: $input) {
        calculatedDraftOrder {
          availableShippingRates { title price { amount currencyCode } }
        }
        userErrors { message }
      }
    }`,
    { input }
  )
  const errore =
    d.errors?.[0]?.message || d.data?.draftOrderCalculate?.userErrors?.[0]?.message
  if (errore) return { stato: 'errore', messaggio: errore }

  const rates = d.data?.draftOrderCalculate?.calculatedDraftOrder?.availableShippingRates ?? []
  return {
    stato: 'ok',
    tariffe: rates
      .map((r) => ({
        titolo: (r.title ?? '').trim() || 'Consegna',
        prezzo: Number(r.price?.amount ?? 0) || 0,
        valuta: r.price?.currencyCode || 'EUR',
      }))
      // La più economica davanti: è quella che il sito propone per prima e che
      // si sceglie nove volte su dieci.
      .sort((a, b) => a.prezzo - b.prezzo),
  }
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

/**
 * Un prodotto con le sue varianti sotto.
 *
 * ⚠️⚠️ Serve perché l'elenco piatto (una riga per variante) è illeggibile:
 * cercando «botticelli» uscivano TRENTA schede, di cui sei con lo stesso titolo
 * e la sola taglia a distinguerle. Prima si sceglie il PRODOTTO, poi la
 * variante — che è anche l'ordine in cui la sceglie il cliente al telefono
 * («il Botticelli» … «grande o medio?»).
 */
export type ProdottoRaggruppato = {
  titolo: string
  immagine: string
  varianti: ProdottoTrovato[]
}

/** I prodotti del negozio che corrispondono a quello che si sta cercando. */
export type EsitoProdotti =
  | {
      stato: 'ok'
      /**
       * L'elenco PIATTO, una riga per variante.
       *
       * ⚠️ Resta perché è il contratto di `/api/v1/nuovo-ordine/prodotti`, che
       * leggono altre app: cambiargli forma sarebbe romperle senza accorgersene
       * (Standard §7). La schermata usa `raggruppati`; qui non si toglie niente.
       */
      prodotti: ProdottoTrovato[]
      /** Gli stessi risultati, un prodotto per riga con le varianti dentro. */
      raggruppati: ProdottoRaggruppato[]
    }
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
            status?: string
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
          status
          featuredImage { url }
          variants(first: 12) { edges { node { id title price availableForSale image { url } } } }
        } }
      }
    }`,
    // ⚠️⚠️ SOLO I PRODOTTI ATTIVI (chiesto dall'utente il 31/08/2026). Su
    // Shopify un prodotto può essere `ACTIVE`, `DRAFT` o `ARCHIVED`: le bozze
    // sono quelle che qualcuno sta ancora preparando — prezzo provvisorio, foto
    // mancante, a volte un doppione — e gli archiviati non si vendono più. Un
    // ordine costruito su uno dei due arriva al cliente con un prezzo che non
    // vale.
    //
    // ⚠️ Il filtro si mette nella QUERY di Shopify e non dopo: `first: 12` conta
    // i prodotti PRIMA del filtro, quindi scartandoli qui una ricerca poteva
    // tornare due risultati su dodici — e sembrare che il catalogo non abbia
    // niente.
    // ⚠️ Con la ricerca vuota si manda `status:active` da solo: «` AND
    // status:active`» con niente davanti è una query malformata, e Shopify
    // risponderebbe con un errore che a schermo sembrerebbe «catalogo rotto».
    { q: q.trim() ? `${q.trim()} AND status:active` : 'status:active' }
  )
  const errore = d.errors?.[0]
  if (errore) {
    if (errore.extensions?.code === 'ACCESS_DENIED' || /access denied/i.test(errore.message)) {
      return { stato: 'senza-permesso' }
    }
    return { stato: 'errore', messaggio: errore.message }
  }

  // Prima il PRODOTTO, poi la variante: le due liste si costruiscono nello
  // stesso giro, così non possono raccontare cose diverse.
  const fuori: ProdottoTrovato[] = []
  const gruppi: ProdottoRaggruppato[] = []
  for (const p of d.data?.products?.edges ?? []) {
    // ⚠️ Seconda rete, sul dato tornato: il filtro nella query è quello che
    // conta, ma se un giorno la sintassi di ricerca di Shopify cambiasse, senza
    // questa riga le bozze rientrerebbero in silenzio — e nessuno se ne
    // accorgerebbe finché un cliente non paga un prezzo provvisorio.
    // `status` assente (versioni vecchie dell'API) non esclude niente: meglio
    // mostrare in più che sparire tutto.
    if (p.node.status && p.node.status.toUpperCase() !== 'ACTIVE') continue
    const varianti: ProdottoTrovato[] = []
    for (const v of p.node.variants?.edges ?? []) {
      const riga: ProdottoTrovato = {
        variantId: v.node.id,
        titolo: p.node.title,
        // «Default Title» è come Shopify chiama la variante unica: mostrarlo
        // sarebbe gergo, e non aggiunge niente.
        variante: v.node.title === 'Default Title' ? '' : v.node.title,
        prezzo: Number(v.node.price) || 0,
        valuta: 'EUR',
        immagine: v.node.image?.url ?? p.node.featuredImage?.url ?? '',
        disponibile: v.node.availableForSale,
      }
      varianti.push(riga)
      fuori.push(riga)
    }
    // Un prodotto senza nemmeno una variante non è ordinabile: non ha un
    // `variantId` da mettere in bozza. Mostrarlo sarebbe una scheda che al
    // clic non fa niente.
    if (varianti.length === 0) continue
    gruppi.push({
      titolo: p.node.title,
      immagine: p.node.featuredImage?.url ?? varianti[0].immagine,
      varianti,
    })
  }
  return { stato: 'ok', prodotti: fuori.slice(0, 30), raggruppati: gruppi }
}

export type DatiNuovoOrdine = {
  negozioId: string
  /** CHI ORDINA E PAGA (il mittente): diventa il cliente Shopify, riceve il link. */
  cliente: { nome: string; cognome: string; email: string; telefono: string }
  /**
   * CHI RICEVE, quando non è la stessa persona (utente, 06/09/2026: «manca in
   * nuovo ordine la possibilità di specificare i dati del mittente»). Fino a
   * qui il nome del cliente finiva anche sull'indirizzo di consegna, e nei
   * regali — che sono quasi tutti i nostri ordini — il valet suonava chiedendo
   * di chi aveva pagato. Vuoto o assente = riceve il mittente stesso.
   */
  destinatario?: { nome: string; cognome: string; telefono: string }
  /**
   * Il cliente ACCONSENTE alle comunicazioni marketing.
   * Shopify registra un cliente creato da una bozza come «non iscritto»: con
   * questo a vero, dopo la creazione, si scrive il consenso sul cliente (single
   * opt-in, con data). Nel modulo la spunta nasce ACCESA (decisione
   * dell'utente, 06/09/2026): l'operatore la toglie se il cliente dice di no.
   * Se la scrittura non riesce si dice: il consenso non si finge.
   */
  consensoMarketing?: boolean
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
   *   **pagato**;
   * · `alla-consegna` — ⭐ 11/09/2026 (utente: «metti come possibilità di
   *   scelta del pagamento … esempio pagamento alla consegna»): l'ordine nasce
   *   **subito e da incassare**. La merce parte, i soldi li prende chi consegna.
   *
   * ⚠️ `alla-consegna` non è «una bozza che aspetta»: è un ordine vero con il
   * pagamento in sospeso. Senza, l'unico modo di far partire un contrassegno
   * era segnarlo pagato quando pagato non era — e da lì in avanti nessuno
   * sapeva più che c'erano dei soldi da prendere.
   */
  pagamento: 'link' | 'pagato' | 'metodo' | 'alla-consegna'
  /**
   * ⭐ 11/09/2026 — QUALE metodo, quando `pagamento` è `metodo`: l'id della riga
   * di Impostazioni → Metodi di pagamento (utente: «consentimi su impostazioni
   * di stabilire per ogni metodo che viene elencato le specifiche»).
   *
   * ⚠️⚠️ Dal modulo arriva SOLO l'id: le specifiche si rileggono dal database.
   * Sono loro a decidere se l'ordine nasce pagato, e una specifica che viaggia
   * nel corpo della richiesta è una specifica che chiunque può riscrivere.
   */
  metodoId?: string
  /**
   * La consegna e ANONIMA: chi riceve non deve sapere da parte di chi.
   * ⚠️ Viaggia in tre posti — nota dell ordine, attributo Consegna_Anonima e
   * nota della consegna in piattaforma: scritta in un posto solo arriverebbe
   * a meta strada.
   */
  // ⚠️ Facoltativo: riconsegne, preventivi e la rotta /v1 creano ordini senza
  // passare da questa spunta, e obbligarli a dichiararla non aggiungerebbe
  // niente — l assenza vuol dire «no».
  anonima?: boolean
  /**
   * ⭐ ECCEZIONE agli orari del negozio (utente, 10/09/2026: «aggiungi anche
   * l'eccezione per data chiusa in nuovo ordine»): il MOTIVO per cui si
   * consegna in un giorno in cui il negozio è chiuso («concordato col fioraio»,
   * «il partner consegna anche la domenica»). Vuoto = nessuna eccezione, e una
   * data chiusa si rifiuta. Il motivo finisce nella nota dell'ordine e in un
   * attributo: chi prepara e chi consegna devono sapere che è un'eccezione.
   * ⚠️ Non copre una data già passata: quella non è un'eccezione, è un errore.
   */
  eccezioneOrari?: string
  /** Con quale mezzo ha pagato: finisce nelle note dell'ordine. */
  mezzoPagamento: string
  /**
   * Aggiungere l'IVA sopra al prezzo delle righe.
   *
   * ⚠️⚠️ Chiesto dall'utente il 28/08/2026: «quando mando un link di pagamento
   * Shopify mi aggiunge l'IVA, deve essere un'opzione che seleziono io». Il
   * motivo è nella configurazione dei negozi: Deluxy e Flowers hanno i prezzi
   * **IVA esclusa** (`taxesIncluded=false`), quindi Shopify di suo calcola
   * l'imposta **sopra** al prezzo e la somma al totale del link. Cake li ha IVA
   * inclusa e non cambia.
   *
   * ⚠️ Di suo è **falso**: il comportamento normale del servizio clienti è NON
   * aggiungere l'IVA (il prezzo concordato è quello). Quando serve la fattura
   * con IVA si spunta la casella. Sotto si traduce in `taxExempt`, all'inverso:
   * IVA non richiesta ⇒ `taxExempt: true` ⇒ Shopify non aggiunge niente.
   *
   * ⚠️ Opzionale, e assente = falso: gli altri chiamanti (riconsegna,
   * preventivo, API v1) non devono aggiungere l'IVA se non la chiedono. Il
   * verso sicuro è NON aggiungerla per sbaglio.
   */
  aggiungiIva?: boolean
  /**
   * Chi lo sta creando.
   *
   * ⚠️ Shopify non lo saprà mai: la bozza è firmata dall'app, non dalla
   * persona. Se non lo passiamo di qui e non lo scriviamo in `OrdineCreato`,
   * la domanda «quanti link di pagamento manda ciascuno» non ha risposta —
   * e non l'avrà nemmeno domani, perché quel dato non esiste da nessun'altra
   * parte da cui ripescarlo.
   */
  operatore?: { id: string; nome: string }
}

export type EsitoNuovoOrdine =
  | {
      ok: true
      bozzaId: string
      linkPagamento: string
      ordineNumero: string
      inviato: boolean
      /** Com'è andata la scrittura del consenso marketing: '' = non chiesto. */
      consensoEsito?: string
    }
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
type BozzaPreparata =
  | { ok: true; n: Negozio; t: string; input: Record<string, unknown>; metodo: Metodo | null }
  | { ok: false; errore: string }

/**
 * Dai dati del modulo all'`input` che Shopify capisce (`DraftOrderInput`), con
 * tutti i controlli che valgono sia per creare sia per modificare una bozza.
 *
 * ⭐ Estratto da `creaOrdine` il 10/09/2026 per la MODIFICA delle bozze:
 * `draftOrderCreate` e `draftOrderUpdate` prendono lo stesso input, e tenerne
 * due copie vorrebbe dire che una correzione (un tetto di 255 caratteri, un
 * attributo nuovo) arriva a una strada e non all'altra.
 */
/**
 * ⭐ 11/09/2026 — «PAGA ALLA CONSEGNA», DETTO A SHOPIFY.
 *
 * ⚠️⚠️ Shopify non lascia scegliere un gateway quando si chiude una bozza (vedi
 * `metodiPagamentoDelNegozio`: i gateway manuali non si possono nemmeno
 * elencare, riprovato sull'API 2025-01). Quello che si può dire è QUANDO è
 * dovuto il pagamento: sono i **termini di pagamento**, e il modello
 * `FULFILLMENT` — «Due on fulfillment» — vuol dire esattamente «si paga quando
 * la merce arriva».
 *
 * Con quei termini sulla bozza, `draftOrderComplete` non crea un ordine pagato:
 * ne crea uno **PENDING**, con l'importo ancora da incassare. Misurato l'11/09
 * su un ordine di prova poi annullato: bozza #D5714 → ordine #12937,
 * `displayFinancialStatus: PENDING`, `totalOutstanding` 1,22 €.
 *
 * ⚠️ L'id del modello si CHIEDE al negozio e non si scrive nel codice: è un
 * `gid` e, anche se oggi è lo stesso ovunque, un id indovinato che sbaglia non
 * dà errore — fa nascere l'ordine con i termini di un altro.
 * ⚠️ Se il negozio non ha il modello, si ripiega su `RECEIPT` («alla ricezione»)
 * e, in mancanza di tutto, si torna `null`: senza termini l'ordine nascerebbe
 * PAGATO, e chi chiama deve poterlo fermare invece di dichiarare incassati dei
 * soldi che nessuno ha preso.
 */
const terminiPerNegozio = new Map<string, { consegna: string | null; ricevuta: string | null }>()

/**
 * ⭐ 11/09/2026 — I DUE MODELLI, non più uno solo: da quando i metodi si
 * impostano (Impostazioni → Metodi di pagamento) un metodo può dire «dovuto
 * alla consegna» (FULFILLMENT) oppure «alla ricezione» (RECEIPT), ed erano due
 * cose che il codice non sapeva distinguere.
 *
 * ⚠️ Si ripiega sull'altro se quello chiesto manca: meglio termini leggermente
 * diversi che un ordine nato PAGATO. Se non c'è nessuno dei due si torna
 * `null`, e chi chiama si ferma.
 */
async function terminiDelNegozio(n: Negozio, t: string, quando: 'consegna' | 'ricevuta'): Promise<string | null> {
  let gia = terminiPerNegozio.get(n.id)
  if (gia === undefined) {
    const r = await graphql<{
      data?: { paymentTermsTemplates?: { id: string; paymentTermsType?: string }[] }
    }>(n, t, `{ paymentTermsTemplates { id paymentTermsType } }`).catch(() => ({}) as never)
    const tutti = r.data?.paymentTermsTemplates ?? []
    gia = {
      consegna: tutti.find((x) => x.paymentTermsType === 'FULFILLMENT')?.id ?? null,
      ricevuta: tutti.find((x) => x.paymentTermsType === 'RECEIPT')?.id ?? null,
    }
    terminiPerNegozio.set(n.id, gia)
  }
  return quando === 'ricevuta' ? (gia.ricevuta ?? gia.consegna) : (gia.consegna ?? gia.ricevuta)
}

/**
 * ⭐ 11/09/2026 — IL METODO DI QUESTO ORDINE, con le sue specifiche.
 *
 * Tre strade, e la terza è quella che tiene in piedi il passato:
 * · `pagamento: 'metodo'` → si rilegge la riga dal database (mai dal modulo);
 * · `pagamento: 'alla-consegna'` → è la vecchia parola del contrassegno, da cui
 *   passano ancora il CRM e la rotta `/api/v1`: vale il metodo di ripiego, cioè
 *   esattamente quello che facevano prima;
 * · tutto il resto → nessun metodo (link, o «ha già pagato»).
 */
async function metodoDellOrdine(d: DatiNuovoOrdine): Promise<Metodo | null | 'sparito'> {
  if (d.pagamento === 'metodo') {
    const m = await metodoPerOrdine(d.metodoId ?? '')
    return m ?? 'sparito'
  }
  if (d.pagamento === 'alla-consegna') {
    return { ...METODO_CONTRASSEGNO, nome: d.mezzoPagamento.trim() || 'Contanti alla consegna' }
  }
  return null
}

async function preparaBozza(d: DatiNuovoOrdine): Promise<BozzaPreparata> {
  // ⭐ 11/09/2026 — IL METODO PRIMA DI TUTTO: da lui dipendono la nota, gli
  // attributi e — soprattutto — se l'ordine nasce pagato o da incassare.
  // ⚠️⚠️ Uno SPARITO ferma tutto: se la riga è stata spenta o tolta mentre la
  // schermata era aperta, l'ordine nascerebbe con una regola che non c'è più —
  // e il caso peggiore è che nasca pagato senza che nessuno abbia incassato.
  const metodo = await metodoDellOrdine(d)
  if (metodo === 'sparito') {
    return {
      ok: false,
      errore:
        'Il metodo di pagamento scelto non c’è più (l’hanno spento o tolto in Impostazioni): ricarica il modulo e scegline un altro.',
    }
  }
  const n = await negozio(d.negozioId)
  if (!n) return { ok: false, errore: 'Negozio non trovato.' }
  const t = await token(n)
  if (!t) return { ok: false, errore: 'Shopify non ha dato un token per questo negozio.' }
  if (!d.righe.length) return { ok: false, errore: 'Aggiungi almeno un prodotto.' }

  // ⭐ ORARI NEGOZI (10/09/2026): la data di consegna deve essere un giorno in
  // cui il negozio è aperto e non una chiusura (né un giorno già passato). Il
  // divieto sta QUI e non solo nel modulo: da questa funzione passano anche le
  // riconsegne, i preventivi e la rotta /api/v1 delle altre app.
  // ⚠️ Senza data non si controlla niente: «non indicata» è un caso ammesso.
  // ⚠️ Senza orari SCRITTI per il negozio non si controlla niente: una regola
  // che nessuno ha impostato non rifiuta ordini.
  // ⭐ ECCEZIONE CONCORDATA (10/09/2026): con un motivo scritto la data chiusa
  // passa, e il motivo viaggia nella nota e in un attributo. Una data già
  // passata NON si concorda.
  let eccezione: { perche: string; motivo: string } | null = null
  if (d.consegna.data.trim()) {
    const orario = await orarioConfigurato(d.negozioId)
    if (orario) {
      const data = d.consegna.data.trim()
      const esito = giornoSelezionabile(orario, data)
      if (!esito.ok) {
        const motivo = (d.eccezioneOrari ?? '').trim().slice(0, 200)
        if (data < oggiIso()) return { ok: false, errore: `${esito.motivo} Una data passata non si può concordare.` }
        if (!motivo) return { ok: false, errore: `${esito.motivo} Scegli un altro giorno, oppure spunta «Eccezione concordata» e scrivi il motivo.` }
        eccezione = { perche: esito.motivo, motivo }
      }
    }
  }

  // ⚠️ I campi dell'indirizzo su Shopify hanno un tetto di 255 caratteri, e
  // superarlo fa fallire TUTTA la creazione — non tronca, rifiuta. Si taglia
  // qui, dove si sa perché; il testo intero resta nella nota dell'ordine.
  const taglia = (v: string, max: number) => (v.length > max ? v.slice(0, max) : v)

  // Il destinatario vale solo se ha almeno un nome: un blocco vuoto è «riceve
  // il mittente», non «riceve nessuno».
  const destinatario =
    d.destinatario && (d.destinatario.nome.trim() || d.destinatario.cognome.trim())
      ? d.destinatario
      : null

  const note = [
    // ⚠️⚠️ Per PRIMA, e in maiuscolo (utente, 02/09/2026): la consegna anonima
    // è l'unica riga della nota che, se non viene letta, rovina il regalo —
    // il valet dice «da parte di …» e la sorpresa è finita. In fondo alla nota,
    // sotto il biglietto e le note di consegna, si legge dopo.
    d.anonima ? 'CONSEGNA ANONIMA: non dire da parte di chi.' : '',
    // ⭐ Subito dopo, e in maiuscolo: chi prepara deve sapere che quel giorno
    // il negozio sarebbe chiuso e che qualcuno ha detto di sì lo stesso.
    eccezione ? `ECCEZIONE ORARI: consegna ${scriviDataBreve(d.consegna.data.trim())} — ${eccezione.perche} Concordato: ${eccezione.motivo}` : '',
    // Chi ha ordinato, quando riceve un altro: sull'ordine Shopify il cliente
    // è il mittente, ma chi legge la nota (fornitore, valet, noi fra un mese)
    // deve vederlo scritto accanto al destinatario.
    destinatario
      ? `Mittente (chi ordina): ${[d.cliente.nome, d.cliente.cognome].map((x) => x.trim()).filter(Boolean).join(' ') || '—'}${d.cliente.telefono.trim() ? ` · ${d.cliente.telefono.trim()}` : ''}`
      : '',
    d.biglietto.trim() ? `Biglietto: ${d.biglietto.trim()}` : '',
    d.consegna.civicoNote.trim() ? `Note consegna: ${d.consegna.civicoNote.trim()}` : '',
    d.pagamento === 'pagato' && d.mezzoPagamento.trim()
      ? `Pagato con: ${d.mezzoPagamento.trim()} (registrato dal servizio clienti)`
      : '',
    // ⚠️⚠️ Il contrassegno si scrive a lettere nella nota: chi consegna legge
    // QUESTA, non lo stato finanziario di Shopify, e deve sapere che deve
    // tornare con dei soldi. L'importo non si ricopia qui — lo sa Shopify, e un
    // numero scritto due volte prima o poi diverge.
    // ⭐ 11/09/2026 — LE RIGHE DEL METODO, come le ha scritte chi l'ha impostato
    // (Impostazioni → Metodi di pagamento). Sono due, e servono a due persone
    // diverse: la prima a chi consegna, la seconda al cliente.
    // ⚠️ L'importo non si ricopia in nessuna delle due — lo sa Shopify, e un
    // numero scritto due volte prima o poi diverge.
    metodo && metodo.comeNasce === 'da-incassare'
      ? metodo.notaConsegna.trim() ||
        `DA INCASSARE ALLA CONSEGNA${metodo.nome.trim() ? ` — ${metodo.nome.trim()}` : ''}: l'ordine non è pagato.`
      : '',
    metodo && metodo.comeNasce === 'pagato'
      ? `Pagato con: ${metodo.nome.trim()} (registrato dal servizio clienti)`
      : '',
    metodo && metodo.istruzioni.trim() ? `Pagamento — ${metodo.nome.trim()}: ${metodo.istruzioni.trim()}` : '',
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
      // ⚠️ Anche come ATTRIBUTO e non solo nella nota: un attributo lo legge
      // una macchina (Orders, e da lì la piattaforma consegne), la nota la
      // legge una persona. Per una cosa che deve arrivare fino al valet
      // servono tutte e due le strade.
      ...(d.anonima ? [{ key: 'Consegna_Anonima', value: 'Si' }] : []),
      // ⭐ L'eccezione agli orari anche come attributo: lo legge una macchina
      // (Orders, piattaforma), la nota la legge una persona.
      ...(eccezione ? [{ key: 'Eccezione_Orari', value: eccezione.motivo }] : []),
      // ⭐ Il contrassegno come ATTRIBUTO: lo legge Orders, e da Orders la
      // piattaforma consegne — che su un ordine in contrassegno fa nascere
      // «Vendita con Pagamento alla Consegna» e dice al valet quanto incassare.
      // Nella nota c'è per le persone, qui per le macchine.
      // ⭐ 11/09/2026: l'attributo lo dice il METODO (Impostazioni), non più il
      // codice. `Pagamento_Alla_Consegna` resta quello del contrassegno — è il
      // nome che in piattaforma fa nascere la «Vendita con Pagamento alla
      // Consegna» — ma un metodo può portarne un altro, o nessuno.
      ...(metodo && metodo.attributo.trim()
        ? [{ key: metodo.attributo.trim(), value: metodo.nome.trim() || 'Si' }]
        : []),
    ],
    // ⚠️⚠️ L'IVA È UNA SCELTA. Su Deluxy e Flowers i prezzi sono IVA esclusa,
    // quindi senza questo Shopify aggiunge l'imposta sopra al totale del link.
    // `taxExempt: true` (quando l'IVA NON è richiesta) glielo impedisce.
    taxExempt: !d.aggiungiIva,
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
            // ⚠️⚠️ UNO SKU ANCHE ALLE RIGHE SCRITTE A MANO (31/08/2026, chiesto
            // dall'utente: «i prodotti che creo da qui e trasmetto a deluxy
            // delivery non hanno un valore sku»). Una riga a mano non viene dal
            // catalogo, quindi Shopify la manda avanti SENZA codice: a valle —
            // Orders, piattaforma consegne — quel prodotto non ha niente con cui
            // essere nominato, e due «Bouquet» dello stesso giorno diventano
            // indistinguibili.
            sku: skuCasuale(),
          }
    ),
    shippingAddress: {
      // ⚠️ Sull'indirizzo di consegna va CHI RICEVE. Il mittente resta il
      // cliente Shopify (email, telefono, link di pagamento).
      firstName: (destinatario ? destinatario.nome : d.cliente.nome).trim() || 'Cliente',
      lastName: (destinatario ? destinatario.cognome : d.cliente.cognome).trim() || '.',
      // ⚠️⚠️ TAGLIATI A 255, che è il limite di Shopify. Segnalato dall'utente
      // il 31/08/2026: incollando delle note di consegna lunghe, Shopify
      // rifiutava TUTTA la creazione con «Address2 in shipping exceeds maximum
      // length of 255 characters» — un ordine perso, col cliente al telefono,
      // per un campo di contorno.
      //
      // ⚠️ Il testo NON si perde: le note di consegna finiscono per intero
      // nella nota dell'ordine qui sopra («Note consegna: …»), che su Shopify
      // non ha questo limite. Qui dentro va la parte che ci sta, perché serve a
      // chi guarda l'indirizzo — il resto si legge nella nota.
      address1: taglia(d.consegna.indirizzo.trim(), 255),
      address2: taglia(d.consegna.civicoNote.trim(), 255) || undefined,
      city: d.consegna.citta.trim(),
      zip: d.consegna.cap.trim(),
      provinceCode: d.consegna.provincia.trim() || undefined,
      countryCode: (d.consegna.paese.trim() || 'IT').toUpperCase(),
      // Il telefono di chi riceve, se lo sappiamo: è quello che il valet chiama
      // sotto casa. Altrimenti quello del mittente, che almeno risponde.
      phone: (destinatario?.telefono.trim() || d.cliente.telefono.trim()) || undefined,
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

  // ⭐ I termini di pagamento, per i metodi che fanno nascere l'ordine DA
  // INCASSARE: sono loro — e solo loro — a impedire che nasca pagato.
  if (metodo && metodo.comeNasce === 'da-incassare') {
    const termini = await terminiDelNegozio(n, t, metodo.quandoDovuto)
    if (!termini) {
      return {
        ok: false,
        errore:
          'Questo negozio non ha i termini di pagamento di Shopify: senza, l’ordine nascerebbe come già pagato. Usa il link di pagamento, oppure fallo nascere pagato solo se ha pagato davvero.',
      }
    }
    input.paymentTerms = { paymentTermsTemplateId: termini }
  }

  return { ok: true, n, t, input, metodo }
}

export async function creaOrdine(d: DatiNuovoOrdine): Promise<EsitoNuovoOrdine> {
  const preparata = await preparaBozza(d)
  if (!preparata.ok) return preparata
  const { n, t, input, metodo } = preparata

  const creata = await graphql<{
    data?: {
      draftOrderCreate?: {
        draftOrder?: {
          id: string
          invoiceUrl: string
          name: string
          customer?: { id: string } | null
          totalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } | null } | null
        } | null
        userErrors?: { field: string[]; message: string }[]
      }
    }
    errors?: { message: string }[]
  }>(
    n,
    t,
    `mutation Crea($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          invoiceUrl
          name
          # Il cliente che Shopify ha creato o riconosciuto: serve per scrivergli
          # il consenso marketing, se chiesto.
          customer { id }
          # Il totale lo calcola Shopify (sconti, spedizione, tasse): il nostro
          # sarebbe una somma a mano, e sulle righe prese dal catalogo non
          # conosciamo nemmeno il prezzo.
          totalPriceSet { shopMoney { amount currencyCode } }
        }
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

  const soldi = bozza.totalPriceSet?.shopMoney
  const importo = Number(soldi?.amount ?? 0) || 0
  const valuta = soldi?.currencyCode || 'EUR'

  // ── IL CONSENSO MARKETING, solo se chiesto ──
  // ⚠️ Di suo Shopify lascia il cliente «non iscritto», e questa app non
  // decide al posto suo. Se la spunta c'è, si scrive sul cliente con data e
  // livello (single opt-in: detto a voce o per messaggio, non da un doppio
  // clic). Se non riesce — di solito manca lo scope write_customers — si dice.
  let consensoEsito = ''
  if (d.consensoMarketing) {
    if (!bozza.customer?.id) {
      consensoEsito = 'Consenso NON registrato: Shopify non ha collegato un cliente alla bozza (serve almeno l’email).'
    } else {
      const c = await graphql<{
        data?: { customerEmailMarketingConsentUpdate?: { userErrors?: { message: string }[] } }
        errors?: { message: string }[]
      }>(
        n,
        t,
        `mutation Consenso($input: CustomerEmailMarketingConsentUpdateInput!) {
          customerEmailMarketingConsentUpdate(input: $input) { userErrors { message } }
        }`,
        {
          input: {
            customerId: bozza.customer.id,
            emailMarketingConsent: {
              marketingState: 'SUBSCRIBED',
              marketingOptInLevel: 'SINGLE_OPT_IN',
              consentUpdatedAt: new Date().toISOString(),
            },
          },
        }
      ).catch((e): { data?: undefined; errors: { message: string }[] } => ({
        errors: [{ message: e instanceof Error ? e.message : 'errore' }],
      }))
      const errore =
        c.errors?.[0]?.message || c.data?.customerEmailMarketingConsentUpdate?.userErrors?.[0]?.message
      consensoEsito = errore
        ? `Consenso marketing NON registrato su Shopify: ${errore}`
        : 'Consenso marketing registrato sul cliente Shopify (iscritto, oggi).'
    }
  }

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
    await segnaOrdineCreato(d, {
      bozzaId: bozza.id,
      bozzaNome: bozza.name,
      ordineNumero: '',
      importo,
      valuta,
      invitoInviato: inviato,
      negozioNome: n.nome,
    })
    return {
      ok: true,
      bozzaId: bozza.id,
      linkPagamento: bozza.invoiceUrl ?? '',
      ordineNumero: '',
      inviato,
      consensoEsito,
    }
  }

  // ── LA BOZZA DIVENTA UN ORDINE ──
  //
  // Due casi, e la mutazione è la stessa: senza termini di pagamento nasce un
  // ordine PAGATO, con i termini uno DA INCASSARE. La differenza l'ha già fatta
  // `preparaBozza` leggendo le specifiche del metodo — qui non si decide più
  // niente.
  //
  // ⚠️ Si rilegge `displayFinancialStatus`: è l'unica prova che i termini hanno
  // fatto effetto. Se un contrassegno tornasse PAID vorrebbe dire che Shopify
  // ha incassato dei soldi che nessuno ha preso, e va detto subito.
  const chiusa = await graphql<{
    data?: {
      draftOrderComplete?: {
        draftOrder?: { order?: { name: string; displayFinancialStatus?: string } | null } | null
        userErrors?: { message: string }[]
      }
    }
    errors?: { message: string }[]
  }>(
    n,
    t,
    `mutation Chiudi($id: ID!) {
      draftOrderComplete(id: $id) {
        draftOrder { order { name displayFinancialStatus } }
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
  const ordineNato = chiusa.data?.draftOrderComplete?.draftOrder?.order
  const numeroVero = ordineNato?.name ?? ''
  // ⚠️ Il controllo che vale: un contrassegno DEVE nascere non pagato. Non si
  // ferma niente (l'ordine ormai c'è), ma chi guarda lo deve sapere subito,
  // perché un ordine «pagato» per sbaglio non lo incassa più nessuno.
  const soldiNonPresi =
    metodo?.comeNasce === 'da-incassare' &&
    ordineNato?.displayFinancialStatus &&
    ordineNato.displayFinancialStatus !== 'PENDING'
      ? ` ⚠️ Attenzione: Shopify lo dà come «${ordineNato.displayFinancialStatus}» invece che da incassare — controllalo prima di farlo partire.`
      : ''
  await segnaOrdineCreato(d, {
    bozzaId: bozza.id,
    bozzaNome: bozza.name,
    ordineNumero: numeroVero,
    importo,
    valuta,
    invitoInviato: false,
    negozioNome: n.nome,
    metodoNome: metodo?.nome ?? '',
  })
  return {
    ok: true,
    bozzaId: bozza.id,
    linkPagamento: '',
    ordineNumero: numeroVero,
    inviato: false,
    consensoEsito: `${consensoEsito}${soldiNonPresi}`.trim(),
  }
}

/**
 * ⭐ MODIFICA UNA BOZZA NON ANCORA PAGATA (utente, 10/09/2026: «consenti di
 * modificare una bozza non ancora pagata»).
 *
 * Il caso di tutti i giorni: il link è partito, il cliente richiama — «metti
 * due rose in più», «l'indirizzo è un altro», «consegnalo sabato». Finora si
 * annullava la bozza e se ne rifaceva una: il cliente riceveva un secondo link
 * e il primo restava pagabile in giro. Qui la STESSA bozza si riscrive con
 * `draftOrderUpdate`: stesso numero (#D…), stesso link di pagamento.
 *
 * ⚠️⚠️ Solo finché non è pagata. Lo stato si chiede a Shopify PRIMA di scrivere:
 * una bozza già chiusa è un ordine, e un ordine si tocca su Shopify (o si
 * rimborsa), non da qui. Se nel frattempo il cliente ha pagato, si scrive il
 * numero dell'ordine sulla riga e si dice di no.
 * ⚠️ Il negozio non si cambia: la bozza vive in QUEL negozio. E non si chiude
 * da qui come «pagata»: per quello c'è «Segna pagata» nell'elenco.
 * ⚠️ `lineItems`, `customAttributes` e `tags` su Shopify si SOSTITUISCONO,
 * non si sommano: per questo si rimanda l'input intero, non la differenza.
 */
export async function aggiornaBozza(
  rigaId: string,
  d: DatiNuovoOrdine,
  opzioni: { reinviaLink?: boolean } = {}
): Promise<EsitoNuovoOrdine> {
  const riga = await db.ordineCreato.findUnique({ where: { id: rigaId } })
  if (!riga) return { ok: false, errore: 'Bozza non trovata.' }
  if (riga.ordineNumero) {
    return { ok: false, errore: `Questa bozza è già diventata l'ordine ${riga.ordineNumero}: non si modifica più.` }
  }
  if (riga.annullataIl) return { ok: false, errore: 'Questa bozza è stata annullata: fanne una nuova.' }
  if (!riga.bozzaId) return { ok: false, errore: 'Di questa riga non sappiamo la bozza su Shopify.' }
  if (d.negozioId !== riga.negozioId) {
    return { ok: false, errore: 'Il negozio di una bozza non si cambia: fanne una nuova.' }
  }
  if (d.pagamento === 'pagato') {
    return { ok: false, errore: 'Per chiuderla come pagata usa «Segna pagata» nell’elenco delle bozze.' }
  }
  // ⚠️ Un metodo non è uno stato che una bozza possa prendere: sia «da
  // incassare» sia «già pagato» fanno nascere un ORDINE, e un ordine non si
  // modifica da qui. Vale per la parola vecchia (`alla-consegna`) e per quella
  // nuova (`metodo`).
  if (d.pagamento === 'alla-consegna' || d.pagamento === 'metodo') {
    return {
      ok: false,
      errore:
        'Una bozza non diventa un ordine con un metodo di pagamento: quello è un ordine che nasce già così. Modifica la bozza e mandale il link, oppure annullala e rifai l’ordine con il metodo che ti serve.',
    }
  }

  const preparata = await preparaBozza(d)
  if (!preparata.ok) return preparata
  const { n, t, input } = preparata

  // 1) Com'è messa ADESSO, secondo Shopify: si scrive solo su una bozza aperta.
  const stato = await graphql<{
    data?: { node?: { status?: string; order?: { name?: string } | null } | null }
  }>(n, t, `query Stato($id: ID!) { node(id: $id) { ... on DraftOrder { status order { name } } } }`, {
    id: riga.bozzaId,
  })
  const nodo = stato.data?.node
  if (!nodo) {
    return { ok: false, errore: 'Shopify non trova più questa bozza: potrebbe essere stata cancellata di là. Fanne una nuova.' }
  }
  if (nodo.order?.name || nodo.status === 'COMPLETED') {
    if (nodo.order?.name) {
      await db.ordineCreato
        .update({ where: { id: riga.id }, data: { ordineNumero: nodo.order.name } })
        .catch(() => {})
    }
    return {
      ok: false,
      errore: `Questa bozza è già stata pagata${nodo.order?.name ? ` (ordine ${nodo.order.name})` : ''}: non si modifica più.`,
    }
  }

  // 2) Si riscrive.
  const agg = await graphql<{
    data?: {
      draftOrderUpdate?: {
        draftOrder?: {
          id: string
          invoiceUrl: string
          name: string
          totalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } | null } | null
        } | null
        userErrors?: { field: string[]; message: string }[]
      }
    }
    errors?: { message: string }[]
  }>(
    n,
    t,
    `mutation Aggiorna($id: ID!, $input: DraftOrderInput!) {
      draftOrderUpdate(id: $id, input: $input) {
        draftOrder {
          id
          invoiceUrl
          name
          totalPriceSet { shopMoney { amount currencyCode } }
        }
        userErrors { field message }
      }
    }`,
    { id: riga.bozzaId, input }
  )
  const erroreAgg = agg.errors?.[0]?.message || agg.data?.draftOrderUpdate?.userErrors?.[0]?.message
  if (erroreAgg) return { ok: false, errore: erroreAgg }
  const bozza = agg.data?.draftOrderUpdate?.draftOrder
  if (!bozza) return { ok: false, errore: 'Shopify non ha aggiornato la bozza.' }

  // 3) Il link al cliente si rimanda solo se chiesto: il link è lo STESSO di
  //    prima, e una seconda mail per una virgola cambiata confonde.
  let inviato = false
  if (opzioni.reinviaLink && d.cliente.email.trim()) {
    const inv = await graphql<{
      data?: { draftOrderInvoiceSend?: { userErrors?: { message: string }[] } }
      errors?: { message: string }[]
    }>(n, t, `mutation Invia($id: ID!) { draftOrderInvoiceSend(id: $id) { userErrors { message } } }`, {
      id: bozza.id,
    })
    inviato = !(inv.errors?.length || inv.data?.draftOrderInvoiceSend?.userErrors?.length)
  }

  // 4) La riga di lavoro segue: importo e cliente come sono ADESSO. Chi l'ha
  //    creata resta chi l'ha creata. ⚠️ Non può far fallire niente: la bozza
  //    su Shopify è già aggiornata.
  const soldi = bozza.totalPriceSet?.shopMoney
  await db.ordineCreato
    .update({
      where: { id: riga.id },
      data: {
        importo: Number(soldi?.amount ?? 0) || 0,
        valuta: soldi?.currencyCode || riga.valuta || 'EUR',
        clienteNome: [d.cliente.nome, d.cliente.cognome].filter(Boolean).join(' ').trim(),
        clienteEmail: d.cliente.email.trim(),
        invitoInviato: riga.invitoInviato || inviato,
      },
    })
    .catch((e) => console.error('[aggiornaBozza] riga non aggiornata', e))

  return {
    ok: true,
    bozzaId: bozza.id,
    linkPagamento: bozza.invoiceUrl ?? '',
    ordineNumero: '',
    inviato,
    consensoEsito: '',
  }
}

/**
 * Scrive la riga di lavoro: chi ha creato quest'ordine, quando, come.
 *
 * ⚠️⚠️ **Non può far fallire niente.** Quando ci arriviamo la bozza su Shopify
 * esiste già: se questa scrittura lanciasse, l'operatore vedrebbe un errore,
 * rifarebbe l'ordine, e il cliente si ritroverebbe due ordini e due link. Un
 * conteggio che perde una riga è un fastidio; un ordine doppio è un danno. Per
 * questo l'errore si scrive nei log e finisce lì.
 *
 * ⚠️ Non è il registro degli ordini (quello è Deluxy Orders): è la riga che
 * risponde a «chi l'ha fatto», e nessuno legge di qui lo stato di un ordine.
 */
async function segnaOrdineCreato(
  d: DatiNuovoOrdine,
  extra: {
    bozzaId: string
    bozzaNome: string
    ordineNumero: string
    importo: number
    valuta: string
    invitoInviato: boolean
    negozioNome: string
    /** Il nome del metodo scelto, quando l'ordine nasce da un metodo. */
    metodoNome?: string
  }
): Promise<void> {
  try {
    await db.ordineCreato.create({
      data: {
        utenteId: d.operatore?.id ?? '',
        utenteNome: d.operatore?.nome ?? '',
        negozioId: d.negozioId,
        negozioNome: extra.negozioNome,
        pagamento: d.pagamento,
        // ⭐ 11/09/2026: col metodo si scrive il suo NOME. Prima, su un ordine
        // che non era «già pagato», la colonna restava vuota: nell'elenco delle
        // bozze non si sapeva più con che accordo fosse partito.
        mezzoPagamento:
          d.pagamento === 'pagato' ? d.mezzoPagamento : (extra.metodoNome ?? ''),
        bozzaId: extra.bozzaId,
        bozzaNome: extra.bozzaNome,
        ordineNumero: extra.ordineNumero,
        importo: extra.importo,
        valuta: extra.valuta,
        clienteNome: [d.cliente.nome, d.cliente.cognome].filter(Boolean).join(' ').trim(),
        clienteEmail: d.cliente.email.trim(),
        invitoInviato: extra.invitoInviato,
      },
    })
  } catch (e) {
    console.error('[nuovo-ordine] riga di lavoro non salvata:', (e as Error).message)
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

export type MetodoNegozio = {
  /** Come lo chiama Shopify: «Shopify Payments», «Paypal», «Bank Deposit»… */
  nome: string
  /** Su quanti ordini recenti compare: i più usati stanno davanti. */
  usato: number
}

/**
 * I METODI DI PAGAMENTO CHE QUEL NEGOZIO USA DAVVERO.
 *
 * ⚠️⚠️ Chiesto dall'utente il 27/08/2026: «implementare come tipologie di
 * pagamento in nuovo ordine tutte le tipologie presenti su Shopify». Prima la
 * tendina aveva cinque voci scritte nel codice — bonifico, contanti, POS,
 * PayPal, altro — che nessuno aveva mai confrontato con Shopify: erano i nomi
 * che usiamo noi, non quelli che si leggono nell'ordine.
 *
 * ⚠️⚠️ E NON SI POSSONO CHIEDERE A SHOPIFY. Provato il 27/08/2026 sull'API vera
 * (2024-10): `manualPaymentGatewayConfigs` **non esiste** su `QueryRoot`, e
 * `shop.paymentSettings` restituisce solo i portafogli digitali. L'unico posto
 * dove i metodi di questo negozio sono scritti sono **i suoi ordini**. Quindi si
 * fa come per le spedizioni: si guarda cosa ha usato davvero.
 *
 * Misurato sui tre negozi, ultimi 60 ordini ciascuno:
 *   Deluxy   → Shopify Payments, Paypal, Manual
 *   Cake     → Shopify Payments, Paypal, **Bank Deposit**, Manual
 *   FLowers  → Shopify Payments, Paypal, Manual
 *
 * ⚠️ «Bank Deposit» ce l'ha solo Cake: una lista scritta nel codice l'avrebbe
 * data a tutti e tre o a nessuno, ed è esattamente il tipo di dettaglio per cui
 * chiedere ai dati vale più che deciderlo.
 *
 * ⚠️ Si legge `formattedGateway` e non `paymentGatewayNames`: il primo è il nome
 * che si vede nell'ordine su Shopify («Bank Deposit»), il secondo è la chiave
 * tecnica («manual»). Chi registra un pagamento deve poter scrivere la stessa
 * parola che poi rileggerà là.
 */
export async function metodiPagamentoDelNegozio(negozioId: string): Promise<MetodoNegozio[]> {
  const n = await negozio(negozioId)
  if (!n) return []
  const t = await token(n)
  if (!t) return []
  const d = await graphql<{
    data?: {
      orders?: {
        edges?: { node: { transactions?: { formattedGateway?: string | null }[] } }[]
      }
    }
  }>(
    n,
    t,
    `{ orders(first: 60, sortKey: CREATED_AT, reverse: true) {
        edges { node { transactions(first: 3) { formattedGateway } } }
      } }`
  )
  const conta = new Map<string, number>()
  for (const e of d.data?.orders?.edges ?? []) {
    // ⚠️ Un ordine con due transazioni sullo stesso mezzo (autorizzazione e
    // cattura) conterebbe due volte: si guarda l'ordine, non la transazione.
    const suoi = new Set<string>()
    for (const tr of e.node.transactions ?? []) {
      const g = (tr.formattedGateway ?? '').trim()
      if (g) suoi.add(g)
    }
    for (const g of suoi) conta.set(g, (conta.get(g) ?? 0) + 1)
  }
  return [...conta.entries()]
    .map(([nome, usato]) => ({ nome, usato }))
    .sort((a, b) => b.usato - a.usato)
    .slice(0, 10)
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

import { leggiImpostazioni } from './impostazioni'

// PARLARE CON LA PIATTAFORMA CONSEGNE (app.deluxy.it / deluxy-delivery).
//
// ⚠️⚠️ A che serve: quando un ordine viene **proposto in automatico a un
// partner** dalla piattaforma, qui non si sapeva. Due persone lavoravano lo
// stesso ordine senza saperlo — una cercava un fioraio a mano mentre la
// piattaforma l'aveva già proposto a qualcuno.
//
// Il canale è quello app-to-app della piattaforma (Standard §4.3): rotte sotto
// `/api/v1/app/…`, chiave nell'header `x-api-key`. È di sola LETTURA: qui non
// si scrive niente nel suo database, si legge lo stato e basta.
//
//   GET /api/v1/app/vendite?source=deluxy-orders&aggiornateDa=<ISO>&limit=200
//   GET /api/v1/app/vendite/by-ref/deluxy-orders/<idOrdineInOrders>
//
// ⚠️⚠️ IL RIFERIMENTO È L'ID DI **ORDERS**, non il numero Shopify e non il
// nostro id. Nella piattaforma la vendita nasce dallo smistamento di Deluxy
// Orders e porta `externalOrderId = <id dell'ordine in Orders>`: chiedere col
// numero «#2798» non troverebbe niente e sembrerebbe «non è in app».
//
// ⚠️ Gli stati della vendita, come li scrive la piattaforma:
//   `da_gestire` · `proposta` · `accettata` · `non_accettata` · `annullata`
// «Proposta» è il momento che ci interessa: l'ordine è già nelle mani dell'app.

const CHIAVE_URL = 'piattaformaUrl'
const CHIAVE_API = 'piattaformaApiKey'
const URL_DEFAULT = 'https://deluxy-delivery.vercel.app'

export type VenditaInApp = {
  /** L'id della vendita nella piattaforma. */
  id: string
  /** L'id dell'ordine in Deluxy Orders: è il ponte fra le due app. */
  riferimentoEsterno: string | null
  /** da_gestire | proposta | accettata | non_accettata | annullata */
  stato: string
  importo: number
  scontoPercento: number
  /** Quanto va al partner: importo meno lo sconto cristallizzato. */
  costoPartner: number
  partner: { id: string; insegna: string | null } | null
  provincia: string | null
  prodotto: { id: string; nome: string; tipo: string } | null
  creataIl: string
  aggiornataIl: string
}

export type ConsegnaInApp = {
  id: string
  stato: string
  data: string | null
  fascia: string | null
  conValet: boolean
} | null

export type VoceInApp = { vendita: VenditaInApp; consegna: ConsegnaInApp }

export type EsitoPiattaforma<T> =
  | { stato: 'ok'; dati: T }
  | { stato: 'non-configurato' }
  | { stato: 'non-trovato' }
  | { stato: 'errore'; messaggio: string }

async function config(): Promise<{ base: string; chiave: string } | null> {
  const env = (process.env.PIATTAFORMA_API_KEY ?? '').trim()
  const c = env ? {} : await leggiImpostazioni([CHIAVE_URL, CHIAVE_API])
  const chiave = env || (c as Record<string, string>)[CHIAVE_API]
  if (!chiave) return null
  const base = (
    (process.env.PIATTAFORMA_URL ?? '').trim() ||
    (c as Record<string, string>)[CHIAVE_URL] ||
    URL_DEFAULT
  ).replace(/\/+$/, '')
  return { base, chiave }
}

/** La piattaforma è collegata? Serve a dirlo a schermo invece di tacere. */
export async function piattaformaCollegata(): Promise<boolean> {
  return (await config()) !== null
}

async function chiama<T>(percorso: string): Promise<EsitoPiattaforma<T>> {
  const c = await config()
  if (!c) return { stato: 'non-configurato' }
  try {
    const res = await fetch(`${c.base}${percorso}`, {
      headers: { 'x-api-key': c.chiave },
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    })
    // ⚠️ 404 = quell'ordine la piattaforma non ce l'ha, e NON è un errore: è la
    // risposta più frequente. Confonderlo con un guasto farebbe comparire un
    // avviso rosso su ogni ordine lavorato a mano.
    if (res.status === 404) return { stato: 'non-trovato' }
    if (res.status === 401 || res.status === 403) {
      return {
        stato: 'errore',
        messaggio:
          'La piattaforma consegne rifiuta la chiave: rigenerala di là e rimettila in Impostazioni.',
      }
    }
    if (!res.ok) return { stato: 'errore', messaggio: `La piattaforma ha risposto ${res.status}.` }
    return { stato: 'ok', dati: (await res.json()) as T }
  } catch (e) {
    return {
      stato: 'errore',
      messaggio: `Piattaforma non raggiungibile: ${e instanceof Error ? e.message : 'errore'}`,
    }
  }
}

/**
 * Lo stato di UN ordine nella piattaforma, per l'id che ha in Deluxy Orders.
 *
 * ⚠️ `non-trovato` vuol dire «non è in app», ed è un'informazione buona: la
 * schermata deve poter dire «lo stiamo lavorando noi» invece di non dire niente.
 */
export async function venditaPerOrdineOrders(
  idInOrders: string
): Promise<EsitoPiattaforma<VoceInApp>> {
  const id = (idInOrders ?? '').trim()
  if (!id) return { stato: 'non-trovato' }
  return chiama<VoceInApp>(`/api/v1/app/vendite/by-ref/deluxy-orders/${encodeURIComponent(id)}`)
}

/**
 * Le vendite aggiornate da un momento in poi: UNA chiamata per tutto il giro.
 *
 * ⚠️⚠️ È il modo giusto di tenere allineata la colonna «In App»: chiedere
 * ordine per ordine vorrebbe dire centinaia di chiamate a ogni giro di cron, e
 * la piattaforma è un'altra app — non un nostro database.
 */
export async function venditeAggiornate(
  da: Date | null,
  limite = 200
): Promise<EsitoPiattaforma<{ totale: number; vendite: VoceInApp[] }>> {
  const p = new URLSearchParams({ source: 'deluxy-orders', limit: String(limite) })
  // ⚠️ Senza `aggiornateDa` la piattaforma torna le prime N e basta: al primo
  // giro va bene, dopo si chiede solo quello che è cambiato.
  if (da) p.set('aggiornateDa', da.toISOString())
  return chiama<{ totale: number; vendite: VoceInApp[] }>(`/api/v1/app/vendite?${p.toString()}`)
}

// ── SCRIVERE NELLA PIATTAFORMA: MANDARE UN ORDINE «IN APP» ───────────────────
//
// ⚠️⚠️ SI USA LA STESSA STRADA DEL FORM di là, non una scorciatoia: la rotta
// `POST /api/v1/app/consegne` è dichiarata «stessa strada del form — prezzo dal
// listino del partner, paga dal listino del valet, attività e notifiche». Una
// consegna scritta a mano nel database della piattaforma sarebbe una consegna
// senza prezzo, senza paga e senza avvisi: esisterebbe e non funzionerebbe.
//
// ⚠️⚠️ Serve una chiave **con permesso di SCRITTURA** (di là c'è un guard che
// gira prima di tutto). Quella di sola lettura, che basta alla colonna «In App»,
// qui riceve un 403 — e il messaggio lo dice, invece di far sembrare rotta la
// consegna.

/** I campi che la piattaforma accetta per creare una consegna (CreateDeliveryDto). */
export type NuovaConsegna = {
  /** `2026-08-29`. Obbligatoria. */
  date: string
  /** Il tipo di servizio, dal catalogo della piattaforma. Obbligatorio. */
  serviceTypeId: string
  recipientFirstName: string
  recipientLastName: string
  recipientAddress: string
  recipientIntercom?: string
  recipientPhone?: string
  recipientEmail?: string
  senderFirstName?: string
  senderLastName?: string
  senderPhone?: string
  deliveryTimeFrom?: string
  deliveryTimeTo?: string
  pickupAddress?: string
  partnerId?: string
  notes?: string
  internalNotes?: string
  /** Il numero d'ordine e il suo brand: con più negozi il numero da solo non identifica. */
  ddtNumber?: string
  ddtBrand?: string
  /**
   * Il nostro riferimento. ⚠️⚠️ È quello che rende la creazione IDEMPOTENTE:
   * lo stesso riferimento dalla stessa chiave non crea una seconda consegna.
   * Senza, un doppio clic o un ritentativo di rete manderebbe lo stesso ordine
   * due volte a due valet diversi.
   */
  riferimentoEsterno?: string
}

export type ConsegnaCreata = { id?: string; number?: number; numero?: number }

export type ServizioPiattaforma = {
  id: string
  nome?: string
  name?: string
  codice?: string
  code?: string
  ambito?: string
  scope?: string
  pricingModel?: string
  attivo?: boolean
  active?: boolean
}

async function scrivi<T>(percorso: string, corpo: unknown): Promise<EsitoPiattaforma<T>> {
  const c = await config()
  if (!c) return { stato: 'non-configurato' }
  try {
    const res = await fetch(`${c.base}${percorso}`, {
      method: 'POST',
      headers: { 'x-api-key': c.chiave, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    })
    if (res.status === 401) {
      return { stato: 'errore', messaggio: 'La piattaforma rifiuta la chiave: rigenerala di là e rimettila in Impostazioni.' }
    }
    // ⚠️ 403 è un caso SUO, e il messaggio deve dirlo: la chiave c'è ed è
    // valida, ma è di sola lettura. Confonderlo con «chiave sbagliata» manda a
    // rigenerare una chiave che andava benissimo per quello che faceva.
    if (res.status === 403) {
      return {
        stato: 'errore',
        messaggio:
          'La chiave della piattaforma non ha il permesso di SCRIVERE: serve una chiave app con scrittura (di là: scripts/crea-chiave-app.mjs).',
      }
    }
    if (res.status === 404) return { stato: 'non-trovato' }
    if (!res.ok) {
      const testo = await res.text().catch(() => '')
      let dettaglio = ''
      try {
        const j = JSON.parse(testo) as { message?: string | string[] }
        dettaglio = Array.isArray(j.message) ? j.message.join('; ') : (j.message ?? '')
      } catch {
        dettaglio = testo.slice(0, 200)
      }
      return {
        stato: 'errore',
        messaggio: `La piattaforma ha risposto ${res.status}${dettaglio ? `: ${dettaglio}` : ''}`,
      }
    }
    return { stato: 'ok', dati: (await res.json().catch(() => ({}))) as T }
  } catch (e) {
    return {
      stato: 'errore',
      messaggio: `Piattaforma non raggiungibile: ${e instanceof Error ? e.message : 'errore'}`,
    }
  }
}

/** Il catalogo dei tipi di servizio: la tendina del modulo si riempie da lì. */
export async function serviziPiattaforma(): Promise<EsitoPiattaforma<ServizioPiattaforma[]>> {
  return chiama<ServizioPiattaforma[]>('/api/v1/app/servizi')
}

export type PartnerPiattaforma = {
  id: string
  insegna: string
  citta?: string
  /** Le sigle delle province che serve: «MI», «RM»… */
  province?: string[]
}

/**
 * I partner attivi della piattaforma, per la tendina.
 *
 * ⚠️⚠️ La consegna dal canale app PRETENDE il partner («dal canale app non c'è
 * un partner sottinteso»), e prima quell'elenco non usciva da lì: l'unico modo
 * di sceglierlo era aprire la piattaforma col browser. Un modulo che ti manda
 * in un'altra app per un campo su venti non lo usa nessuno — la rotta
 * `/app/partner` è stata aggiunta di là apposta (31/08/2026).
 */
export async function partnerPiattaforma(): Promise<EsitoPiattaforma<PartnerPiattaforma[]>> {
  return chiama<PartnerPiattaforma[]>('/api/v1/app/partner')
}

/** Crea la consegna nella piattaforma, dalla stessa porta che usa il form di là. */
export async function creaConsegnaInPiattaforma(
  d: NuovaConsegna
): Promise<EsitoPiattaforma<ConsegnaCreata>> {
  return scrivi<ConsegnaCreata>('/api/v1/app/consegne', d)
}

/**
 * Dice alla piattaforma che la vendita è andata in consegna: di là passa in
 * storico (accettata).
 *
 * ⚠️ Best-effort e SEPARATO dalla creazione: se questa fallisce la consegna
 * esiste comunque, e rifarla creerebbe un doppione. Meglio una vendita che
 * resta «da gestire» di là — visibile, correggibile — che due consegne.
 */
export async function portaVenditaInConsegna(
  idInOrders: string,
  deliveryId: string
): Promise<EsitoPiattaforma<unknown>> {
  return scrivi<unknown>(
    `/api/v1/app/vendite/by-ref/deluxy-orders/${encodeURIComponent(idInOrders)}/in-consegna`,
    { deliveryId }
  )
}

// ⚠️ Gli stati e i loro nomi stanno in `piattaforma-stati.ts`, che non importa
// né la rete né le impostazioni: lo usa anche la scheda dell'ordine, che è un
// componente client. Qui si ri-esportano, così chi sta sul server ha tutto da
// un file solo.
export { STATI_IN_APP, eInApp, nomeStatoVendita } from './piattaforma-stati'

// ── LE CONSEGNE, PER CHIUDERE GLI ORDINI CHE SONO PARTITI ────────────────────

export type ConsegnaDdt = {
  id: string
  /** Il numero che si legge a schermo di là (es. 62637). */
  numero?: number | string
  stato: string
  /** Il nostro numero d'ordine e il suo brand: è il ponte. */
  ddtNumero?: string
  ddtBrand?: string
}

/**
 * Le consegne cambiate dopo `da`, con il DDT e lo stato.
 *
 * ⚠️ Una chiamata a giro con un cursore, non una per ordine: la piattaforma è
 * un'altra app, non un nostro database. E si legge quello che serve — numero,
 * stato, ddt — non tutta la consegna.
 */
export async function consegneAggiornate(
  da: Date | null,
  limite = 200
): Promise<EsitoPiattaforma<{ consegne: ConsegnaDdt[] }>> {
  const p = new URLSearchParams({ limit: String(limite) })
  if (da) p.set('aggiornateDa', da.toISOString())
  const r = await chiama<{ consegne?: Record<string, unknown>[] } | Record<string, unknown>[]>(
    `/api/v1/app/consegne?${p.toString()}`
  )
  if (r.stato !== 'ok') return r
  // ⚠️ La rotta di là può tornare `{ consegne: [...] }` oppure un array secco a
  // seconda della versione: si accettano tutte e due invece di rompersi su una
  // forma. Una lista vuota per «forma diversa» sembrerebbe «nessuna consegna»,
  // che è la bugia peggiore qui dentro — l'ordine resterebbe aperto per sempre.
  const grezze = Array.isArray(r.dati) ? r.dati : ((r.dati.consegne as Record<string, unknown>[]) ?? [])
  const consegne: ConsegnaDdt[] = grezze.map((c) => ({
    id: String(c.id ?? ''),
    numero: (c.numero ?? c.code) as number | string | undefined,
    stato: String(c.stato ?? c.status ?? ''),
    ddtNumero: (c.ddtNumero ?? c.ddtNumber) as string | undefined,
    ddtBrand: (c.ddtBrand ?? c.ddt_brand) as string | undefined,
  }))
  return { stato: 'ok', dati: { consegne } }
}

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

// ⚠️ Gli stati e i loro nomi stanno in `piattaforma-stati.ts`, che non importa
// né la rete né le impostazioni: lo usa anche la scheda dell'ordine, che è un
// componente client. Qui si ri-esportano, così chi sta sul server ha tutto da
// un file solo.
export { STATI_IN_APP, eInApp, nomeStatoVendita } from './piattaforma-stati'

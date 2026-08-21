// L'indirizzo di consegna, preso da Google Maps invece che digitato.
//
// ⚠️ PERCHÉ NON BASTA UN CAMPO DI TESTO: l'indirizzo lo detta il cliente al
// telefono, e chi scrive sbaglia una cifra del civico o del CAP — poi il valet
// suona alla porta sbagliata e l'errore si scopre col mazzo in mano. Con
// l'autocompletamento l'indirizzo esiste per forza: lo ha scelto qualcuno da un
// elenco, non l'ha inventato la tastiera.
//
// ⚠️ La chiave sta nel SERVER, non nel browser: una chiave Maps esposta in
// pagina la usa chiunque, e la paga Deluxy. Il browser parla solo con le nostre
// rotte.

import { leggiImpostazioni } from './impostazioni'

const AUTOCOMPLETE = 'https://places.googleapis.com/v1/places:autocomplete'
const DETTAGLIO = 'https://places.googleapis.com/v1/places'

// ── La strada vecchia, che è quella che funziona con la chiave che abbiamo ──
//
// ⚠️⚠️ SONO DUE API DIVERSE, non due indirizzi della stessa: «Places API (New)»
// e «Places API» si abilitano separatamente sul progetto Google, e una chiave
// che va benissimo per una risponde all'altra **403 · API not enabled**.
// La chiave che il gruppo usa già (Ricerca fornitori, `api/fornitori.js`) parla
// con la VECCHIA. Quindi: si prova la nuova, e se il progetto non ce l'ha si
// passa alla vecchia senza chiedere niente a nessuno.
const AUTOCOMPLETE_VECCHIA = 'https://maps.googleapis.com/maps/api/place/autocomplete/json'
const DETTAGLIO_VECCHIO = 'https://maps.googleapis.com/maps/api/place/details/json'

/** L'errore di Google dice che quell'API non è accesa su questo progetto? */
function apiNonAccesa(messaggio: string): boolean {
  return /not enabled|has not been used|disabled|PERMISSION_DENIED|API key not valid/i.test(
    messaggio
  )
}

/** Suggerimenti con la Places API vecchia (quella della chiave che già usiamo). */
async function suggerisciVecchia(testo: string, k: string): Promise<EsitoIndirizzi> {
  const p = new URLSearchParams({
    input: testo,
    key: k,
    language: 'it',
    types: 'address',
  })
  const res = await fetch(`${AUTOCOMPLETE_VECCHIA}?${p.toString()}`, { cache: 'no-store' })
  const d = (await res.json().catch(() => ({}))) as {
    status?: string
    error_message?: string
    predictions?: {
      place_id?: string
      structured_formatting?: { main_text?: string; secondary_text?: string }
      description?: string
    }[]
  }
  if (d.status && d.status !== 'OK' && d.status !== 'ZERO_RESULTS') {
    return { stato: 'errore', messaggio: d.error_message || d.status }
  }
  return {
    stato: 'ok',
    suggerimenti: (d.predictions ?? [])
      .map((x) => ({
        id: x.place_id ?? '',
        testo: x.structured_formatting?.main_text ?? x.description ?? '',
        secondario: x.structured_formatting?.secondary_text ?? '',
      }))
      .filter((x) => x.id && x.testo),
  }
}

export type Suggerimento = { id: string; testo: string; secondario: string }

export type EsitoIndirizzi =
  | { stato: 'ok'; suggerimenti: Suggerimento[] }
  | { stato: 'senza-chiave' }
  | { stato: 'errore'; messaggio: string }

async function chiave(): Promise<string> {
  const c = await leggiImpostazioni(['googleMapsApiKey'])
  return (c.googleMapsApiKey ?? '').trim()
}

/**
 * I possibili indirizzi per quello che si sta scrivendo.
 *
 * ⚠️ Senza chiave si dice **senza-chiave**, non «nessun risultato»: chi scrive
 * deve sapere che l'app non sta cercando, altrimenti conclude che l'indirizzo
 * non esiste e lo riscrive tre volte.
 */
export async function suggerisciIndirizzi(q: string): Promise<EsitoIndirizzi> {
  const testo = q.trim()
  if (testo.length < 4) return { stato: 'ok', suggerimenti: [] }
  const k = await chiave()
  if (!k) return { stato: 'senza-chiave' }
  try {
    const res = await fetch(AUTOCOMPLETE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': k },
      body: JSON.stringify({
        input: testo,
        // Solo indirizzi veri: senza questo tornano anche negozi e città, che
        // qui non servono e allungano l'elenco.
        includedPrimaryTypes: ['street_address', 'premise', 'subpremise', 'route'],
        languageCode: 'it',
      }),
      cache: 'no-store',
    })
    const d = (await res.json().catch(() => ({}))) as {
      suggestions?: {
        placePrediction?: {
          placeId?: string
          structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }
        }
      }[]
      error?: { message?: string }
    }
    if (d.error?.message) {
      // La nuova non c'è su questo progetto: si va con la vecchia, che è quella
      // che la nostra chiave conosce.
      if (apiNonAccesa(d.error.message)) return suggerisciVecchia(testo, k)
      return { stato: 'errore', messaggio: d.error.message }
    }
    return {
      stato: 'ok',
      suggerimenti: (d.suggestions ?? [])
        .map((s) => ({
          id: s.placePrediction?.placeId ?? '',
          testo: s.placePrediction?.structuredFormat?.mainText?.text ?? '',
          secondario: s.placePrediction?.structuredFormat?.secondaryText?.text ?? '',
        }))
        .filter((s) => s.id && s.testo),
    }
  } catch (e) {
    return { stato: 'errore', messaggio: (e as Error).message }
  }
}

export type IndirizzoScelto = {
  indirizzo: string
  cap: string
  citta: string
  provincia: string
  paese: string
}

/**
 * L'indirizzo scelto, spezzato nei campi dell'ordine.
 *
 * ⚠️ Si prendono i **componenti**, non la stringa formattata: Shopify vuole
 * via, CAP, città e provincia separati, e spezzare a mano una riga di testo
 * («Via Roma 12, 20100 Milano MI, Italia») è il modo in cui il CAP finisce
 * nella città una volta su dieci.
 */
export async function dettaglioIndirizzo(placeId: string): Promise<IndirizzoScelto | null> {
  const k = await chiave()
  if (!k || !placeId) return null
  const res = await fetch(`${DETTAGLIO}/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': k,
      'X-Goog-FieldMask': 'addressComponents,formattedAddress',
    },
    cache: 'no-store',
  })
  const d = (await res.json().catch(() => ({}))) as {
    addressComponents?: { longText?: string; shortText?: string; types?: string[] }[]
    error?: { message?: string }
  }
  // ⚠️ Stessa storia dei suggerimenti: se la Places nuova non è accesa si
  // chiede alla vecchia, che usa nomi di campo diversi (`long_name` invece di
  // `longText`) — per questo la traduzione è qui e non nel chiamante.
  let pezzi = d.addressComponents ?? []
  if (!pezzi.length && (d.error?.message ? apiNonAccesa(d.error.message) : true)) {
    const p = new URLSearchParams({ place_id: placeId, key: k, language: 'it', fields: 'address_component' })
    const vecchia = await fetch(`${DETTAGLIO_VECCHIO}?${p.toString()}`, { cache: 'no-store' })
    const dv = (await vecchia.json().catch(() => ({}))) as {
      result?: { address_components?: { long_name?: string; short_name?: string; types?: string[] }[] }
    }
    pezzi = (dv.result?.address_components ?? []).map((c) => ({
      longText: c.long_name,
      shortText: c.short_name,
      types: c.types,
    }))
  }
  const prendi = (tipo: string, corto = false) => {
    const c = pezzi.find((x) => x.types?.includes(tipo))
    return (corto ? c?.shortText : c?.longText) ?? ''
  }
  const via = prendi('route')
  const civico = prendi('street_number')
  if (!via) return null
  return {
    // In Italia il civico va dopo la via: «Via Roma 12», non «12 Via Roma».
    indirizzo: [via, civico].filter(Boolean).join(' '),
    cap: prendi('postal_code'),
    citta: prendi('locality') || prendi('administrative_area_level_3'),
    // La sigla, che è quella che vuole Shopify («MI», non «Milano»).
    provincia: prendi('administrative_area_level_2', true),
    paese: prendi('country', true) || 'IT',
  }
}

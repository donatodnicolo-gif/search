// CERCARE UN FORNITORE CHE NON CONOSCIAMO ANCORA, SU GOOGLE MAPS.
//
// ⚠️⚠️ Perché serve: le tre fonti di casa (chi abbiamo pagato, chi ha già
// preparato ordini, il registro Anagrafiche) rispondono benissimo a «chi
// conosciamo», e non rispondono affatto a «chi c'è a Lecce che sa fare una
// millefoglie per domani». Quella domanda si faceva aprendo un'altra app e
// ricopiando a mano nome e telefono, che è il momento in cui una cifra si
// sbaglia.
//
// ⚠️⚠️ QUESTA RICERCA SI PAGA, a chiamata. Per questo NON parte mentre si
// scrive: parte solo premendo un bottone, quando in casa non si è trovato
// quello che serve. Un autocompletamento su Maps a ogni tasto costerebbe
// centinaia di ricerche al giorno per riempire un campo che nove volte su
// dieci si riempiva da solo con quello che sapevamo già.
//
// ⚠️ E il TELEFONO non si chiede per tutti i risultati: la ricerca di testo non
// lo restituisce, servirebbe una chiamata di dettaglio **per ciascuno**. Si
// chiede solo per quello che viene scelto — una chiamata invece di venti.
//
// ⚠️ La chiave sta nel SERVER (Impostazioni → `googleMapsApiKey`), come per gli
// indirizzi: una chiave Maps esposta in pagina la usa chiunque e la paga Deluxy.

import { leggiImpostazioni } from './impostazioni'

const CERCA_NUOVA = 'https://places.googleapis.com/v1/places:searchText'
const CERCA_VECCHIA = 'https://maps.googleapis.com/maps/api/place/textsearch/json'
const DETTAGLIO_VECCHIO = 'https://maps.googleapis.com/maps/api/place/details/json'
const DETTAGLIO_NUOVO = 'https://places.googleapis.com/v1/places'

export type LuogoMaps = {
  /** L'id di Google: serve per chiedere il telefono quando lo si sceglie. */
  id: string
  nome: string
  indirizzo: string
  citta: string
  /** Il giudizio medio e su quante recensioni: è tutto quello che sappiamo di lui. */
  voto: number | null
  recensioni: number
  chiuso: boolean
}

export type EsitoMaps =
  | { stato: 'ok'; luoghi: LuogoMaps[] }
  | { stato: 'senza-chiave' }
  | { stato: 'errore'; messaggio: string }

async function chiave(): Promise<string> {
  const c = await leggiImpostazioni(['googleMapsApiKey'])
  return (c.googleMapsApiKey ?? '').trim()
}

/**
 * ⚠️⚠️ SONO DUE API DIVERSE, non due indirizzi della stessa: «Places API (New)»
 * e «Places API» si abilitano separatamente sul progetto Google, e una chiave
 * che va benissimo per una risponde all'altra **403 · API not enabled**. Stessa
 * situazione già incontrata negli indirizzi: si prova la nuova e si ricade sulla
 * vecchia senza chiedere niente a nessuno.
 */
function apiNonAccesa(messaggio: string): boolean {
  return /not enabled|has not been used|disabled|PERMISSION_DENIED|API key not valid|REQUEST_DENIED|are blocked|is blocked/i.test(
    messaggio
  )
}

/**
 * La città, ricavata dall'indirizzo formattato.
 *
 * ⚠️⚠️ Si cerca il pezzo che comincia col CAP, NON «il penultimo». Il penultimo
 * era la prima cosa che ho scritto, e sui risultati veri dava questo:
 *
 *   «Via Salvatore Trinchese, 7, 73100 Lecce LE» → città «7»
 *
 * perché l'API vecchia separa il civico con una virgola e non mette «, Italia»
 * in fondo, mentre quella nuova sì. Contare le virgole vuol dire dipendere da
 * quale delle due API ha risposto — e sono due, per progetto Google diverso.
 * Il CAP invece sta sempre lì, e attaccata ha la città.
 */
export function cittaDa(indirizzo: string): string {
  const pezzi = (indirizzo || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const conCap = pezzi.find((p) => /^\d{5}\s+\S/.test(p))
  if (conCap) {
    // «73100 Lecce LE» → «Lecce». ⚠️ La sigla si toglie solo se è in fondo e
    // maiuscola: «Reggio Emilia RE» sì, «Firenze» resta «Firenze».
    return conCap.replace(/^\d{5}\s*/, '').replace(/\s+[A-Z]{2}$/, '').trim()
  }
  // ⚠️ Nessun CAP: si prende l'ultimo pezzo che non sia il paese. Meglio una
  // riga in meno che una città inventata dal civico.
  const utili = pezzi.filter((p) => !/^(italia|italy)$/i.test(p))
  const ultimo = utili[utili.length - 1] ?? ''
  return /^\d+$/.test(ultimo) ? '' : ultimo.replace(/\s+[A-Z]{2}$/, '').trim()
}

/** Cerca un'attività su Maps. `dove` restringe alla zona di consegna. */
export async function cercaSuMaps(q: string, dove = ''): Promise<EsitoMaps> {
  const testo = [q.trim(), dove.trim()].filter(Boolean).join(' ')
  if (testo.length < 3) return { stato: 'ok', luoghi: [] }
  const k = await chiave()
  // ⚠️ «senza-chiave» e non «nessun risultato»: chi cerca deve sapere che l'app
  // non sta cercando, o conclude che quel fioraio non esiste.
  if (!k) return { stato: 'senza-chiave' }

  try {
    const res = await fetch(CERCA_NUOVA, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': k,
        // ⚠️ La maschera dei campi è OBBLIGATORIA sulla nuova API, e si paga
        // per quello che si chiede: qui il minimo che serve a riconoscere il
        // posto. Il telefono NON c'è di proposito — vedi in cima.
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.businessStatus',
      },
      body: JSON.stringify({ textQuery: testo, languageCode: 'it', maxResultCount: 12 }),
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    })
    const d = (await res.json().catch(() => ({}))) as {
      places?: {
        id?: string
        displayName?: { text?: string }
        formattedAddress?: string
        rating?: number
        userRatingCount?: number
        businessStatus?: string
      }[]
      error?: { message?: string }
    }
    if (d.error?.message) {
      if (apiNonAccesa(d.error.message)) return cercaVecchia(testo, k)
      return { stato: 'errore', messaggio: d.error.message }
    }
    return {
      stato: 'ok',
      luoghi: (d.places ?? [])
        .map((p) => ({
          id: p.id ?? '',
          nome: p.displayName?.text ?? '',
          indirizzo: p.formattedAddress ?? '',
          citta: cittaDa(p.formattedAddress ?? ''),
          voto: typeof p.rating === 'number' ? p.rating : null,
          recensioni: p.userRatingCount ?? 0,
          chiuso: p.businessStatus === 'CLOSED_PERMANENTLY',
        }))
        .filter((p) => p.id && p.nome),
    }
  } catch (e) {
    return { stato: 'errore', messaggio: (e as Error).message }
  }
}

async function cercaVecchia(testo: string, k: string): Promise<EsitoMaps> {
  const p = new URLSearchParams({ query: testo, key: k, language: 'it', region: 'it' })
  try {
    const res = await fetch(`${CERCA_VECCHIA}?${p}`, {
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    })
    const d = (await res.json().catch(() => ({}))) as {
      status?: string
      error_message?: string
      results?: {
        place_id?: string
        name?: string
        formatted_address?: string
        rating?: number
        user_ratings_total?: number
        business_status?: string
      }[]
    }
    if (d.status && d.status !== 'OK' && d.status !== 'ZERO_RESULTS') {
      return { stato: 'errore', messaggio: d.error_message || d.status }
    }
    return {
      stato: 'ok',
      luoghi: (d.results ?? [])
        .slice(0, 12)
        .map((r) => ({
          id: r.place_id ?? '',
          nome: r.name ?? '',
          indirizzo: r.formatted_address ?? '',
          citta: cittaDa(r.formatted_address ?? ''),
          voto: typeof r.rating === 'number' ? r.rating : null,
          recensioni: r.user_ratings_total ?? 0,
          chiuso: r.business_status === 'CLOSED_PERMANENTLY',
        }))
        .filter((r) => r.id && r.nome),
    }
  } catch (e) {
    return { stato: 'errore', messaggio: (e as Error).message }
  }
}

export type DettaglioMaps = {
  nome: string
  indirizzo: string
  citta: string
  telefono: string
  sito: string
}

/**
 * Telefono e sito di UN luogo, chiesti solo quando viene scelto.
 * ⚠️ Una chiamata invece di venti: vedi la nota in cima al file.
 */
export async function dettaglioMaps(
  id: string
): Promise<{ stato: 'ok'; luogo: DettaglioMaps } | { stato: 'errore'; messaggio: string }> {
  const k = await chiave()
  if (!k) return { stato: 'errore', messaggio: 'Manca la chiave Google Maps nelle Impostazioni.' }
  try {
    const res = await fetch(`${DETTAGLIO_NUOVO}/${encodeURIComponent(id)}`, {
      headers: {
        'X-Goog-Api-Key': k,
        'X-Goog-FieldMask':
          'displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri',
      },
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    })
    const d = (await res.json().catch(() => ({}))) as {
      displayName?: { text?: string }
      formattedAddress?: string
      nationalPhoneNumber?: string
      internationalPhoneNumber?: string
      websiteUri?: string
      error?: { message?: string }
    }
    if (d.error?.message) {
      if (apiNonAccesa(d.error.message)) return dettaglioVecchio(id, k)
      return { stato: 'errore', messaggio: d.error.message }
    }
    return {
      stato: 'ok',
      luogo: {
        nome: d.displayName?.text ?? '',
        indirizzo: d.formattedAddress ?? '',
        citta: cittaDa(d.formattedAddress ?? ''),
        // ⚠️ Si preferisce l'internazionale: un +39 si può chiamare e si può
        // scrivere su WhatsApp, un numero locale no.
        telefono: d.internationalPhoneNumber || d.nationalPhoneNumber || '',
        sito: d.websiteUri ?? '',
      },
    }
  } catch (e) {
    return { stato: 'errore', messaggio: (e as Error).message }
  }
}

async function dettaglioVecchio(
  id: string,
  k: string
): Promise<{ stato: 'ok'; luogo: DettaglioMaps } | { stato: 'errore'; messaggio: string }> {
  const p = new URLSearchParams({
    place_id: id,
    key: k,
    language: 'it',
    fields: 'name,formatted_address,formatted_phone_number,international_phone_number,website',
  })
  try {
    const res = await fetch(`${DETTAGLIO_VECCHIO}?${p}`, {
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    })
    const d = (await res.json().catch(() => ({}))) as {
      status?: string
      error_message?: string
      result?: {
        name?: string
        formatted_address?: string
        formatted_phone_number?: string
        international_phone_number?: string
        website?: string
      }
    }
    if (d.status !== 'OK' || !d.result) {
      return { stato: 'errore', messaggio: d.error_message || d.status || 'nessun dettaglio' }
    }
    return {
      stato: 'ok',
      luogo: {
        nome: d.result.name ?? '',
        indirizzo: d.result.formatted_address ?? '',
        citta: cittaDa(d.result.formatted_address ?? ''),
        telefono: d.result.international_phone_number || d.result.formatted_phone_number || '',
        sito: d.result.website ?? '',
      },
    }
  } catch (e) {
    return { stato: 'errore', messaggio: (e as Error).message }
  }
}

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

/**
 * TUTTO QUELLO CHE MAPS SA DI UN LUOGO, e che serve a farne un'anagrafica.
 *
 * ⚠️⚠️ Chiesto dall'utente il 27/08/2026: «devi importare tutti i dati da maps
 * che servono per creare il contatto in anagrafiche». Prima di allora di un
 * fornitore trovato su Maps arrivavano **nome, telefono e città** — e la città
 * ricavata a naso dall'indirizzo scritto: nel registro entrava un contatto con
 * il nome e basta, cioè quello che poi qualcuno ricopia a mano dal telefono.
 *
 * ⚠️ L'indirizzo si prende **a PEZZI** (`addressComponents`), non tagliando la
 * riga formattata: la riga è pensata per essere letta, cambia forma fra le due
 * API (vedi `cittaDa`) e in Francia o in Svizzera cambia del tutto. I pezzi
 * hanno un nome — `locality`, `postal_code`, `administrative_area_level_2` — e
 * quel nome vale in ogni paese.
 *
 * ⚠️ `voto` e `recensioni` sono di GOOGLE, e restano di Google: non finiscono
 * mai nel `votoD2C` del registro, che è **il nostro** giudizio sulle consegne
 * («li scrive Deluxy, non il cliente finale», dice lo schema di Anagrafiche).
 * Confonderli vorrebbe dire leggere «4,6» credendo di aver valutato noi un
 * fornitore che non abbiamo mai usato.
 */
export type DettaglioMaps = {
  /** Il `place_id`: l'identità del luogo per Google. */
  id: string
  nome: string
  /** La riga formattata, come la scrive Google. */
  indirizzo: string
  /** Via e civico da soli, quando i pezzi ci sono. */
  via: string
  cap: string
  citta: string
  /** La sigla, quando Google la dà (`administrative_area_level_2` breve). */
  provincia: string
  regione: string
  paese: string
  telefono: string
  sito: string
  /** L'indirizzo della scheda su Google Maps. */
  mappa: string
  /** ⚠️ Il giudizio di GOOGLE, non il nostro. */
  voto: number | null
  recensioni: number
  chiuso: boolean
  /** I tipi Google (`florist`, `bakery`, …): da lì si ricava il mestiere. */
  tipi: string[]
}

function dettaglioVuoto(): DettaglioMaps {
  return {
    id: '', nome: '', indirizzo: '', via: '', cap: '', citta: '', provincia: '',
    regione: '', paese: '', telefono: '', sito: '', mappa: '', voto: null,
    recensioni: 0, chiuso: false, tipi: [],
  }
}

/** Un pezzo d'indirizzo, nella forma dell'una o dell'altra API. */
export type PezzoIndirizzo = {
  longText?: string
  shortText?: string
  long_name?: string
  short_name?: string
  types?: string[]
}

/**
 * I pezzi dell'indirizzo, messi al loro posto.
 *
 * ⚠️ `locality` è il comune, ma NON c'è sempre: nei paesi anglosassoni la città
 * postale è `postal_town`, e in certi comuni italiani il pezzo che porta il
 * nome è `administrative_area_level_3`. Si prova in quest'ordine e ci si ferma
 * al primo che risponde — meglio la città giusta trovata al terzo tentativo che
 * un campo vuoto.
 *
 * ⚠️ La PROVINCIA si prende **breve** (`shortText`: «MI»), la REGIONE **lunga**
 * («Lombardia»): sono i due formati che usa il registro, e `siglaProvincia` sa
 * fare solo il verso città→sigla.
 */
export function pezziIndirizzo(pezzi: PezzoIndirizzo[]): {
  via: string
  cap: string
  citta: string
  provincia: string
  regione: string
  paese: string
} {
  const lungo = (t: string): string => {
    const p = pezzi.find((x) => (x.types ?? []).includes(t))
    return (p?.longText ?? p?.long_name ?? '').trim()
  }
  const breve = (t: string): string => {
    const p = pezzi.find((x) => (x.types ?? []).includes(t))
    return (p?.shortText ?? p?.short_name ?? '').trim()
  }
  const strada = lungo('route')
  const civico = lungo('street_number')
  return {
    // ⚠️ In Italia il civico va DOPO la via: «Via Roma 12», non «12 Via Roma».
    via: [strada, civico].filter(Boolean).join(' '),
    cap: lungo('postal_code'),
    citta:
      lungo('locality') ||
      lungo('postal_town') ||
      lungo('administrative_area_level_3') ||
      '',
    provincia: breve('administrative_area_level_2'),
    regione: lungo('administrative_area_level_1'),
    paese: lungo('country'),
  }
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
        // ⚠️ La maschera dice a Google che cosa mandare **e quanto costa**: i
        // campi si pagano a fasce, e telefono e sito ci mettevano già nella
        // fascia più cara. I pezzi dell'indirizzo, i tipi e il link alla scheda
        // stanno in fasce più basse — chiederli qui non cambia la fascia della
        // chiamata, che resta **una sola** e solo per il luogo scelto.
        'X-Goog-FieldMask': [
          'id',
          'displayName',
          'formattedAddress',
          'addressComponents',
          'nationalPhoneNumber',
          'internationalPhoneNumber',
          'websiteUri',
          'googleMapsUri',
          'rating',
          'userRatingCount',
          'businessStatus',
          'primaryType',
          'types',
        ].join(','),
      },
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    })
    const d = (await res.json().catch(() => ({}))) as {
      id?: string
      displayName?: { text?: string }
      formattedAddress?: string
      addressComponents?: PezzoIndirizzo[]
      nationalPhoneNumber?: string
      internationalPhoneNumber?: string
      websiteUri?: string
      googleMapsUri?: string
      rating?: number
      userRatingCount?: number
      businessStatus?: string
      primaryType?: string
      types?: string[]
      error?: { message?: string }
    }
    if (d.error?.message) {
      if (apiNonAccesa(d.error.message)) return dettaglioVecchio(id, k)
      return { stato: 'errore', messaggio: d.error.message }
    }
    const parti = pezziIndirizzo(d.addressComponents ?? [])
    return {
      stato: 'ok',
      luogo: {
        ...dettaglioVuoto(),
        // ⚠️ L'id lo si rimanda: chi ha chiesto il dettaglio deve poterlo
        // riattaccare al luogo scelto senza tenerselo da parte.
        id: d.id || id,
        nome: d.displayName?.text ?? '',
        indirizzo: d.formattedAddress ?? '',
        ...parti,
        // ⚠️ `cittaDa` resta come RIPIEGO, non come regola: se i pezzi non
        // arrivano (chiave senza quel campo, luogo senza `locality`) è meglio
        // la città letta dalla riga che nessuna città — senza città un
        // fornitore nel registro non torna più indietro, perché la lista
        // «fornitori in zona» filtra per provincia.
        citta: parti.citta || cittaDa(d.formattedAddress ?? ''),
        // ⚠️ Si preferisce l'internazionale: un +39 si può chiamare e si può
        // scrivere su WhatsApp, un numero locale no.
        telefono: d.internationalPhoneNumber || d.nationalPhoneNumber || '',
        sito: d.websiteUri ?? '',
        mappa: d.googleMapsUri ?? '',
        voto: typeof d.rating === 'number' ? d.rating : null,
        recensioni: d.userRatingCount ?? 0,
        chiuso: d.businessStatus === 'CLOSED_PERMANENTLY',
        // ⚠️ Il tipo principale davanti: è quello su cui Google si sbilancia.
        tipi: [d.primaryType ?? '', ...(d.types ?? [])].filter(Boolean),
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
    // ⚠️ Gli stessi dati dell'API nuova, coi nomi vecchi: qui l'elenco si
    // sbilancia sul `address_component` (singolare, è così che si chiama nella
    // vecchia) — un nome sbagliato non dà errore, semplicemente non arriva.
    fields: [
      'place_id',
      'name',
      'formatted_address',
      'address_component',
      'formatted_phone_number',
      'international_phone_number',
      'website',
      'url',
      'rating',
      'user_ratings_total',
      'business_status',
      'type',
    ].join(','),
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
        place_id?: string
        name?: string
        formatted_address?: string
        address_components?: PezzoIndirizzo[]
        formatted_phone_number?: string
        international_phone_number?: string
        website?: string
        url?: string
        rating?: number
        user_ratings_total?: number
        business_status?: string
        types?: string[]
      }
    }
    if (d.status !== 'OK' || !d.result) {
      return { stato: 'errore', messaggio: d.error_message || d.status || 'nessun dettaglio' }
    }
    const parti = pezziIndirizzo(d.result.address_components ?? [])
    return {
      stato: 'ok',
      luogo: {
        ...dettaglioVuoto(),
        id: d.result.place_id || id,
        nome: d.result.name ?? '',
        indirizzo: d.result.formatted_address ?? '',
        ...parti,
        citta: parti.citta || cittaDa(d.result.formatted_address ?? ''),
        telefono: d.result.international_phone_number || d.result.formatted_phone_number || '',
        sito: d.result.website ?? '',
        mappa: d.result.url ?? '',
        voto: typeof d.result.rating === 'number' ? d.result.rating : null,
        recensioni: d.result.user_ratings_total ?? 0,
        chiuso: d.result.business_status === 'CLOSED_PERMANENTLY',
        tipi: d.result.types ?? [],
      },
    }
  } catch (e) {
    return { stato: 'errore', messaggio: (e as Error).message }
  }
}

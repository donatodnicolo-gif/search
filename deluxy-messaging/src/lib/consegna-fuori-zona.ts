import { leggiImpostazioni } from '@/lib/impostazioni'
import { tariffeConsegna } from '@/lib/nuovo-ordine'

// ── QUANTO COSTA PORTARLO DOVE IL SITO NON ARRIVA ──
//
// ⚠️⚠️ Chiesto dall'utente il 02/09/2026: «consenti di inserire qualsiasi
// indirizzo (anche fuori Milano, Roma e Firenze)… puoi calcolare
// automaticamente il costo della consegna per le extra-urbane?».
//
// L'indirizzo libero c'era già: la schermata non ha mai avuto un elenco di
// città ammesse, e quando il sito non ha una tariffa lo dice invece di
// inventarne una. Quello che mancava è il NUMERO: fuori zona l'operatore
// restava con un campo vuoto e nessun appiglio, e ogni volta si tirava a
// indovinare — un prezzo diverso per lo stesso viaggio a seconda di chi
// rispondeva al telefono.
//
// ⚠️ Il conto NON si inventa: si ricalca quello che il sito già fa dentro le
// sue zone. Misurato il 02/09 sul catalogo vero (deluxy.it, prodotto fisico):
//
//     Milano   in città            15 €
//     Monza    25,6 km da Milano   45 €   →  1,76 €/km
//     Bergamo  58,6 km da Milano   80 €   →  1,37 €/km
//
// I due €/km sono diversi perché non è una tariffa al chilometro pura: è
// «prezzo in città + tanto al km». Sui due punti veri la retta è
// **18 € + 1,06 €/km** — cioè, in pratica, la tariffa cittadina del brand più
// UN euro al chilometro di strada. Con base 15 € e 1,00 €/km, arrotondando per
// eccesso a 5, Monza torna 45 € (esatto) e Bergamo 75 € (il sito dice 80).
//
// ⚠️⚠️ E vale per il caso in cui **usciamo noi** dalla città coperta. Se quella
// consegna la fa un fioraio del posto, i chilometri non li fa nessuno e questo
// prezzo è una stangata: per questo la stima si MOSTRA e non si scrive mai da
// sola, e porta scritto accanto da dove parte.

/** Da dove si esce, quando si esce: le città dove abbiamo i nostri. */
const PARTENZE_PREDEFINITE = ['Milano', 'Roma', 'Firenze']

/**
 * Il CAP e la provincia delle città da cui usciamo.
 *
 * ⚠️⚠️ Servono per CHIEDERE la tariffa cittadina a Shopify. Misurato il
 * 02/09/2026: con la sola città («Roma», senza CAP né provincia)
 * `draftOrderCalculate` torna **zero tariffe** — e la stima partiva da base 0,
 * cioè senza il pezzo di prezzo che il sito chiede comunque. Con CAP e
 * provincia torna 25 €.
 */
const DATI_CITTA: Record<string, { cap: string; provincia: string }> = {
  milano: { cap: '20121', provincia: 'MI' },
  roma: { cap: '00184', provincia: 'RM' },
  firenze: { cap: '50122', provincia: 'FI' },
}

/** L'euro al chilometro di ripiego, se in Impostazioni non c'è scritto niente. */
const EURO_KM_PREDEFINITO = 1

/**
 * Oltre questi chilometri non si propone un prezzo al km.
 *
 * ⚠️⚠️ Misurato il 02/09/2026: per Abu Dhabi Google **una strada la trova**
 * (5.910 km via terra) e la stima diceva **5.915 €**. Un numero del genere
 * dentro un modulo è peggio di nessun numero: qualcuno lo mette. Oltre questa
 * soglia — e fuori dall'Italia — non ci si va in auto: consegna un fornitore
 * del posto, e il prezzo è un'altra cosa.
 */
const KM_MASSIMI = 800

export type StimaFuoriZona = {
  /** La città coperta più vicina alla consegna, quella da cui si parte. */
  partenza: string
  /** Chilometri di STRADA (Google Directions), non in linea d'aria. */
  km: number
  /** La tariffa che il sito chiede dentro quella città, per questo carrello. */
  base: number
  baseTitolo: string
  euroPerKm: number
  /** `base + km × euroPerKm`, arrotondato per eccesso a 5 €. */
  prezzo: number
}

export type EsitoStima =
  | { stato: 'ok'; stima: StimaFuoriZona }
  /** Manca la chiave di Google Maps: senza strada non si stima niente. */
  | { stato: 'senza-chiave' }
  /** Google non trova una strada (oltremare, o indirizzo troppo vago). */
  | { stato: 'senza-strada'; provate: string[] }
  /** Una strada c'è, ma è un viaggio che non si fa in auto: là consegna un altro. */
  | { stato: 'troppo-lontano'; km: number; partenza: string }

/**
 * I chilometri di strada fra due posti, o `null`.
 *
 * ⚠️ Directions e non la distanza in linea d'aria: fra Milano e Bergamo l'aria
 * dice 45 km e la strada 58,6 — su un euro al chilometro sono 14 € di
 * differenza. È la stessa chiamata che usa la piattaforma consegne per la paga
 * dei valet, così i due conti non possono divergere.
 */
async function kmDiStrada(chiave: string, da: string, a: string): Promise<number | null> {
  const url =
    'https://maps.googleapis.com/maps/api/directions/json?origin=' +
    encodeURIComponent(da) +
    '&destination=' +
    encodeURIComponent(a) +
    '&region=it&language=it&key=' +
    encodeURIComponent(chiave)
  try {
    const res = await fetch(url, { cache: 'no-store' })
    const d = (await res.json().catch(() => ({}))) as {
      status?: string
      routes?: { legs?: { distance?: { value?: number } }[] }[]
    }
    const metri = d.routes?.[0]?.legs?.reduce((s, l) => s + (l.distance?.value ?? 0), 0) ?? 0
    if (d.status !== 'OK' || metri <= 0) return null
    return Math.round(metri / 100) / 10
  } catch {
    return null
  }
}

/** Su a 5 €: un prezzo di consegna si legge come un prezzo, non come un conto. */
function aCinque(v: number): number {
  return Math.ceil(v / 5) * 5
}

/**
 * Quanto chiedere per una consegna dove il sito non ha tariffe.
 *
 * Si fa solo quando serve: la chiama la rotta delle tariffe **quando Shopify
 * torna a mani vuote**. Se il sito una tariffa ce l'ha, vince il sito — è lui
 * il listino, non noi (Standard §7).
 */
export async function stimaFuoriZona(
  negozioId: string,
  destinazione: { indirizzo: string; citta: string; cap: string; provincia: string; paese: string },
  righe: { variantId?: string; titolo?: string; prezzo?: number; quantita: number }[]
): Promise<EsitoStima> {
  const conf = await leggiImpostazioni(['googleMapsApiKey', 'euroPerKmFuoriCitta', 'cittaDiPartenza'])
  const chiave = (conf.googleMapsApiKey || '').trim()
  if (!chiave) return { stato: 'senza-chiave' }

  const euroPerKm = Number(String(conf.euroPerKmFuoriCitta || '').replace(',', '.')) || EURO_KM_PREDEFINITO
  const partenze = (conf.cittaDiPartenza || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const daDove = partenze.length ? partenze : PARTENZE_PREDEFINITE

  // L'indirizzo per Google: il più preciso che abbiamo. La via da sola sarebbe
  // ambigua (di «via Roma» ce n'è una per comune), la città da sola porta al
  // centro — che per una stima al chilometro va benissimo.
  const dove = [destinazione.indirizzo, destinazione.cap, destinazione.citta, destinazione.provincia]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(', ')
  if (!dove) return { stato: 'senza-strada', provate: [] }

  // ⚠️ Si misura da TUTTE le città coperte e si tiene la più vicina: da Roma a
  // Matera sono 422 km, da Milano 922. Partire dalla città sbagliata
  // raddoppierebbe il prezzo di una consegna vera.
  const misure = await Promise.all(daDove.map(async (c) => ({ citta: c, km: await kmDiStrada(chiave, c, dove) })))
  const buone = misure.filter((m): m is { citta: string; km: number } => m.km != null)
  if (!buone.length) return { stato: 'senza-strada', provate: daDove }
  const vicina = buone.reduce((a, b) => (b.km < a.km ? b : a))

  // ⚠️ Fuori dall'Italia, o troppo lontano: non ci si va in auto. Un prezzo al
  // km qui sarebbe un numero enorme e sbagliato — e i numeri scritti in un
  // modulo qualcuno li usa.
  const fuoriItalia = (destinazione.paese || 'IT').trim().toUpperCase() !== 'IT'
  if (fuoriItalia || vicina.km > KM_MASSIMI) {
    return { stato: 'troppo-lontano', km: vicina.km, partenza: vicina.citta }
  }

  // La base è la tariffa VERA del sito dentro quella città, per questo
  // carrello: così un brand che in città consegna gratis parte da zero, e uno
  // che chiede 25 € parte da 25. Se il sito non risponde nemmeno lì, base 0 —
  // meglio un prezzo basso e dichiarato che uno inventato.
  const dati = DATI_CITTA[vicina.citta.trim().toLowerCase()] ?? { cap: '', provincia: '' }
  const dentro = await tariffeConsegna(
    negozioId,
    { citta: vicina.citta, cap: dati.cap, provincia: dati.provincia, paese: 'IT' },
    righe
  )
  const tariffa =
    dentro.stato === 'ok' && dentro.tariffe.length
      ? dentro.tariffe.reduce((a, b) => (b.prezzo < a.prezzo ? b : a))
      : null

  const base = tariffa?.prezzo ?? 0
  return {
    stato: 'ok',
    stima: {
      partenza: vicina.citta,
      km: vicina.km,
      base,
      baseTitolo: tariffa?.titolo ?? '',
      euroPerKm,
      prezzo: aCinque(base + vicina.km * euroPerKm),
    },
  }
}

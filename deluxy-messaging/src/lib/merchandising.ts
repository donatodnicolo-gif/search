import { leggiImpostazioni } from './impostazioni'

// LA SCHEDA DEL PRODOTTO, CHIESTA A MERCHANDISING.
//
// ⚠️⚠️ Chiesto dall'utente il 04/09/2026: «nel pop-up della vendita fai aprire
// dettaglio prodotto nella relativa colonna che apre un pop-up di fianco con i
// dettagli del prodotto con provenienza app merchandising».
//
// ⚠️ Perché non si legge dal database: il prodotto ha una casa sola, ed è
// Merchandising (Standard Deluxy §7). Qui non se ne tiene nessuna copia — né
// una tabella, né un campo sull'ordine: si chiede quando serve, e quando
// Merchandising non risponde si dice che non risponde. Un prodotto ricopiato
// qui sarebbe vecchio il giorno dopo, e nessuno saprebbe quale delle due schede
// è quella vera.
//
// ⚠️ Quello che l'ordine sa del prodotto (titolo, variante, foto, prezzo
// pagato) arriva da Shopify e resta dov'è: sono due cose diverse. Shopify dice
// **cosa ha comprato il cliente**, Merchandising dice **che cos'è quel
// prodotto** — categoria, descrizione, costo di produzione, prezzo di listino,
// in che fase di vita è.

const URL_DEFAULT = 'https://deluxy-merchandising.vercel.app'

/** La scheda come la manda Merchandising (`GET /api/v1/prodotti`). */
export type ProdottoMerch = {
  id: string
  codice: string
  nome: string
  fase: string
  categoria: string
  descrizione: string | null
  costoProduzione: number
  prezzoVendita: number
  immagine: string | null
  tipoShopify: string | null
  vendorShopify: string | null
  origine: string
  esclusoDaAnalisi: boolean
  aggiornatoIl: string
}

export type EsitoProdotto =
  | { stato: 'ok'; prodotto: ProdottoMerch; comeTrovato: 'codice' | 'nome' }
  | { stato: 'non-trovato' }
  | { stato: 'non-configurato'; manca: 'chiave' | 'indirizzo' }
  | { stato: 'errore'; messaggio: string }

/** Nomi confrontabili: due schede dello stesso bouquet non si scrivono uguali. */
function chiave(v: string): string {
  return (v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * La scheda del prodotto di una riga d'ordine.
 *
 * ⚠️⚠️ SI CERCA PRIMA PER SKU, poi per nome, e si DICE quale delle due ha
 * funzionato. Non è un dettaglio: lo SKU è un'identità, il nome è una
 * somiglianza — «Bouquet Rose Rosa e Viola» può esistere in tre taglie e in due
 * negozi. Chi legge la scheda deve sapere se sta guardando quel prodotto o uno
 * che si chiama come lui, altrimenti legge un costo di produzione che non è di
 * questo ordine.
 */
export async function prodottoDaMerchandising(
  sku: string,
  titolo: string
): Promise<EsitoProdotto> {
  const c = await leggiImpostazioni(['merchandisingUrl', 'merchandisingApiKey'])
  const base = (c.merchandisingUrl || URL_DEFAULT).trim().replace(/\/$/, '')
  const apiKey = (c.merchandisingApiKey ?? '').trim()
  if (!base) return { stato: 'non-configurato', manca: 'indirizzo' }
  if (!apiKey) return { stato: 'non-configurato', manca: 'chiave' }

  // ⚠️ La rotta di Merchandising cerca per NOME (`q`), non per codice: lo SKU
  // si usa dopo, sulle righe tornate, per riconoscere quella giusta. Si chiede
  // col titolo perché è l'unica cosa che quella ricerca sa usare.
  const testo = (titolo || sku).trim()
  if (!testo) return { stato: 'non-trovato' }

  let dati: { prodotti?: ProdottoMerch[] }
  try {
    const res = await fetch(
      `${base}/api/v1/prodotti?limit=50&q=${encodeURIComponent(testo)}`,
      { headers: { 'x-api-key': apiKey }, cache: 'no-store' }
    )
    if (res.status === 401 || res.status === 403) {
      return { stato: 'errore', messaggio: 'Merchandising rifiuta la chiave (401/403): va rifatta.' }
    }
    if (!res.ok) {
      return { stato: 'errore', messaggio: `Merchandising ha risposto ${res.status}.` }
    }
    dati = (await res.json()) as { prodotti?: ProdottoMerch[] }
  } catch (e) {
    return { stato: 'errore', messaggio: `Merchandising non risponde: ${(e as Error).message}` }
  }

  const prodotti = dati.prodotti ?? []
  if (!prodotti.length) return { stato: 'non-trovato' }

  const skuPulito = (sku ?? '').trim().toLowerCase()
  if (skuPulito) {
    const perCodice = prodotti.find((p) => (p.codice ?? '').trim().toLowerCase() === skuPulito)
    if (perCodice) return { stato: 'ok', prodotto: perCodice, comeTrovato: 'codice' }
  }
  const perNome = prodotti.find((p) => chiave(p.nome) === chiave(titolo))
  if (perNome) return { stato: 'ok', prodotto: perNome, comeTrovato: 'nome' }
  // ⚠️ Nessun ripiego sul «primo risultato»: una ricerca per parole può tornare
  // dieci bouquet e il primo non è più giusto degli altri. Meglio dire che non
  // si è trovato: chi legge apre Merchandising e guarda.
  return { stato: 'non-trovato' }
}

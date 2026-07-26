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
}

export type EsitoArchivio =
  | { stato: 'ok'; totale: number; ordini: OrdineArchivio[] }
  | { stato: 'non-configurato' }
  | { stato: 'errore'; messaggio: string }

type OrdineOrders = {
  id: string
  brand: string
  numero: string
  data: string
  totale: number
  valuta: string
  cliente?: { nome?: string | null; email?: string | null; telefono?: string | null }
  spedizione?: { citta?: string | null }
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
    ordini: (corpo.ordini ?? []).map((o) => ({
      id: o.id,
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
    })),
  }
}

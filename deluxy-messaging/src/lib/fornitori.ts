import { leggiImpostazioni } from './impostazioni'

// Ponte verso l'app Ricerca fornitori (search-deluxy).
//
// Due modi di aprirla dal bottone "Fornitore" sotto un ordine:
//  1. link FIRMATO (preferito): POST /api/link con la chiave dlxs_… restituisce
//     un URL con un codice a tempo (?t=…, ~5 minuti) che fa entrare senza
//     digitare la password. Ci aggiungiamo brand e ordine.
//  2. link semplice: ?brand=…&ordine=… — funziona sempre, ma l'app chiede
//     l'accesso. È il ripiego quando la chiave non è configurata.

const BASE_DEFAULT = 'https://search-deluxy.vercel.app'

function base(url: string): string {
  return (url || BASE_DEFAULT).replace(/\/$/, '')
}

/** Numero d'ordine nudo: l'app lo vuole senza cancelletto. */
function numeroNudo(numero: string): string {
  return numero.replace(/^#/, '').trim()
}

/** Link semplice, senza chiave: apre l'app già impostata sull'ordine. */
export function linkSemplice(baseUrl: string, brand: string, numero: string): string {
  const p = new URLSearchParams({ brand, ordine: numeroNudo(numero) })
  return `${base(baseUrl)}/?${p}`
}

export type EsitoLink = { url: string; firmato: boolean; nota?: string }

/**
 * Link di accesso all'app Ricerca fornitori per un ordine. Se la chiave è
 * configurata chiede all'app un codice a tempo, altrimenti ripiega sul link
 * semplice — così il bottone funziona comunque.
 */
export async function linkFornitore(brand: string, numero: string): Promise<EsitoLink> {
  const c = await leggiImpostazioni(['searchUrl', 'searchApiKey'])
  const baseUrl = base(c.searchUrl)
  const semplice = linkSemplice(baseUrl, brand, numero)
  // Nessuna chiave = nessun codice di accesso = l'app chiederà la password. Lo
  // si dice qui perché è il caso più frequente, e chi lo incontra sta guardando
  // una schermata di login senza sapere che manca una configurazione.
  if (!c.searchApiKey) {
    return {
      url: semplice,
      firmato: false,
      nota:
        'Ricerca fornitori chiederà la password: manca la sua chiave API. ' +
        'Creala là come amministratore e incollala in Impostazioni → Ricerca fornitori.',
    }
  }

  try {
    const res = await fetch(`${baseUrl}/api/link`, {
      method: 'POST',
      headers: { 'x-api-key': c.searchApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ quando: new Date().toISOString() }),
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    })
    const corpo = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      url?: string
      code?: string
      error?: string
    }
    if (!res.ok || !corpo.ok || !(corpo.url || corpo.code)) {
      return {
        url: semplice,
        firmato: false,
        nota:
          res.status === 401 || res.status === 403
            ? 'Chiave di Ricerca fornitori non valida: aperto senza accesso automatico.'
            : corpo.error || `Ricerca fornitori ha risposto ${res.status}.`,
      }
    }

    // All'URL con il codice aggiungiamo brand e ordine, così l'app si apre
    // già sull'ordine giusto invece che sulla home.
    const url = new URL(corpo.url ?? `${baseUrl}/?t=${corpo.code}`)
    url.searchParams.set('brand', brand)
    url.searchParams.set('ordine', numeroNudo(numero))
    return { url: url.toString(), firmato: true }
  } catch (e) {
    const err = e as Error
    return {
      url: semplice,
      firmato: false,
      nota:
        err.name === 'TimeoutError'
          ? 'Ricerca fornitori non ha risposto in tempo: aperta senza accesso automatico.'
          : `Ricerca fornitori non raggiungibile: ${err.message}`,
    }
  }
}

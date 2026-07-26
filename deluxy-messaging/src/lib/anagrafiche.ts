import { leggiImpostazioni } from './impostazioni'

// Ponte verso Deluxy Anagrafiche, il registro centralizzato dei partner B2B.
//
// REGOLA DEL REGISTRO (deluxy-anagrafiche/README.md): "Non tenete una copia
// locale: rileggete". Qui infatti non c'è nessuna tabella Partner — si chiede al
// registro ogni volta. Un partner disattivato là sparisce subito anche di qui, e
// non ci si ritrova a scrivere a un'insegna che non lavora più con noi.
//
// Configurazione in Impostazioni: anagraficheUrl + anagraficheApiKey (cifrata).
// La chiave resta lato server: il browser parla solo con /api/partner.

const BASE_DEFAULT = 'https://deluxy-anagrafiche.vercel.app'

// "Attivo" nel registro è lo stato COMMERCIALE `attivo`, che vuol dire proprio
// "è un Partner" (gli altri valori sono prospect, in trattativa, dismesso…).
const STATO_PARTNER = 'attivo'

export type Partner = {
  id: string
  nome: string
  ragioneSociale: string
  categoria: string
  citta: string
  provincia: string
  indirizzo: string
  telefono: string
  email: string
  statoFinanziario: string
  ultimaVisita: string
  note: string
  contatti: { ruolo: string; nome: string; telefono: string; email: string }[]
}

export type EsitoPartner =
  | { stato: 'ok'; totale: number; partner: Partner[]; categorie: string[]; citta: string[] }
  | { stato: 'non-configurato' }
  | { stato: 'errore'; messaggio: string }

type PartnerRegistro = {
  id?: string
  nome?: string
  ragioneSociale?: string
  categoria?: string
  citta?: string
  provincia?: string
  indirizzo?: string
  telefono?: string
  email?: string
  statoFinanziario?: string
  ultimaVisita?: string
  note?: string
  contatti?: { ruolo?: string; nome?: string; telefono?: string; email?: string }[]
}

function normalizza(p: PartnerRegistro): Partner {
  return {
    id: String(p.id ?? ''),
    nome: p.nome ?? '',
    ragioneSociale: p.ragioneSociale ?? '',
    categoria: p.categoria ?? '',
    citta: p.citta ?? '',
    provincia: p.provincia ?? '',
    indirizzo: p.indirizzo ?? '',
    telefono: p.telefono ?? '',
    email: p.email ?? '',
    statoFinanziario: p.statoFinanziario ?? '',
    ultimaVisita: p.ultimaVisita ?? '',
    note: p.note ?? '',
    contatti: (p.contatti ?? []).map((c) => ({
      ruolo: c.ruolo ?? '',
      nome: c.nome ?? '',
      telefono: c.telefono ?? '',
      email: c.email ?? '',
    })),
  }
}

/**
 * I partner ATTIVI dal registro, con ricerca e filtri.
 *
 * `q` è multi-parola su tutti i campi (anagrafica + referenti), lato registro.
 */
export async function partnerAttivi(opzioni: {
  q?: string
  categoria?: string
  citta?: string
  pagina?: number
  perPagina?: number
}): Promise<EsitoPartner> {
  const config = await leggiImpostazioni(['anagraficheUrl', 'anagraficheApiKey'])
  const chiave = config.anagraficheApiKey
  if (!chiave) return { stato: 'non-configurato' }
  const base = (config.anagraficheUrl || BASE_DEFAULT).replace(/\/+$/, '')

  const p = new URLSearchParams({
    stato: STATO_PARTNER,
    page: String(Math.max(1, opzioni.pagina ?? 1)),
    perPage: String(Math.min(200, opzioni.perPagina ?? 200)),
  })
  if (opzioni.q?.trim()) p.set('q', opzioni.q.trim())
  if (opzioni.categoria?.trim()) p.set('categoria', opzioni.categoria.trim())
  if (opzioni.citta?.trim()) p.set('citta', opzioni.citta.trim())

  let res: Response
  try {
    res = await fetch(`${base}/api/v1/partners?${p.toString()}`, {
      headers: { 'x-api-key': chiave },
      cache: 'no-store',
    })
  } catch (e) {
    return { stato: 'errore', messaggio: `Registro non raggiungibile: ${(e as Error).message}` }
  }

  if (res.status === 401 || res.status === 403) {
    return { stato: 'errore', messaggio: 'Chiave delle Anagrafiche rifiutata (401/403).' }
  }
  if (!res.ok) {
    return { stato: 'errore', messaggio: `Anagrafiche ha risposto ${res.status}.` }
  }

  const dati = (await res.json().catch(() => ({}))) as {
    totale?: number
    dati?: PartnerRegistro[]
  }
  const partner = (dati.dati ?? []).map(normalizza)

  // Le tendine dei filtri si costruiscono da quello che è tornato: il registro
  // non ha un endpoint per l'elenco delle categorie.
  const categorie = [...new Set(partner.map((x) => x.categoria).filter(Boolean))].sort()
  const citta = [...new Set(partner.map((x) => x.citta).filter(Boolean))].sort()

  return { stato: 'ok', totale: dati.totale ?? partner.length, partner, categorie, citta }
}

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
  /**
   * Dov'è arrivata la relazione: prospect | in_contatto | in_attesa |
   * in_trattativa | da_ricontattare | attivo | non_interessato | dismesso.
   * «attivo» vuol dire partner operativo — gli altri NON sono scarti.
   */
  stato: string
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
  stato?: string
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
    stato: p.stato ?? '',
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
  /**
   * Lo stato da chiedere al registro. Di suo `attivo`, cioè i soli partner
   * operativi — è quello che serve alla pagina /partner.
   *
   * ⚠️ `tutti` serve a chi cerca **qualcuno da chiamare adesso**, non un
   * partner: per un ordine in una provincia dove non abbiamo nessuno, una
   * pasticceria già censita come *prospect* è esattamente il numero da fare, ed
   * è quello che mostra da sempre l'app Ricerca fornitori. Escludere tutto ciò
   * che non è «attivo» faceva dire «nessun fornitore» con il fornitore scritto
   * in tabella.
   */
  stato?: string
}): Promise<EsitoPartner> {
  // Prima le env (`ANAGRAFICHE_URL`/`ANAGRAFICHE_API_KEY`, standard §4.4),
  // poi le Impostazioni come ripiego per chi le aveva già lì.
  const envUrl = (process.env.ANAGRAFICHE_URL ?? '').trim()
  const envChiave = (process.env.ANAGRAFICHE_API_KEY ?? '').trim()
  const config: { anagraficheUrl?: string; anagraficheApiKey?: string } = envChiave
    ? {}
    : await leggiImpostazioni(['anagraficheUrl', 'anagraficheApiKey'])
  const chiave = envChiave || config.anagraficheApiKey
  if (!chiave) return { stato: 'non-configurato' }
  const base = (envUrl || config.anagraficheUrl || BASE_DEFAULT).replace(/\/+$/, '')

  const chiesto = (opzioni.stato ?? STATO_PARTNER).trim()
  const p = new URLSearchParams({
    page: String(Math.max(1, opzioni.pagina ?? 1)),
    perPage: String(Math.min(200, opzioni.perPagina ?? 200)),
  })
  // «tutti» = non si filtra per stato lato registro (il filtro lo fa chi chiama).
  if (chiesto && chiesto !== 'tutti') p.set('stato', chiesto)
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

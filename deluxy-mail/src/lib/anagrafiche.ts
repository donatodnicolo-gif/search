// Integrazione con il registro centralizzato Anagrafiche (deluxy-anagrafiche):
// serve a) a dire se un contatto è un'azienda registrata, b) a riconciliare la
// posta con i CLIENTI (partner con stato "attivo") per email o per dominio.
//
// Sola lettura per l'elenco/ricerca; la scrittura (associare un'email a
// un'azienda) usa la stessa chiave: se è di sola lettura, il server risponde 401/403.

import { leggiChiaviApp } from './chiaviApp'

const ANAGRAFICHE_URL = (process.env.ANAGRAFICHE_URL || 'https://deluxy-anagrafiche.vercel.app').replace(/\/$/, '')

async function chiave(): Promise<string> {
  try {
    const chiavi = await leggiChiaviApp()
    return chiavi.anagrafiche || ''
  } catch {
    return ''
  }
}

type ContattoApi = { email?: string | null }
type PartnerApi = {
  id: string
  nome: string
  stato?: string | null
  citta?: string | null
  categoria?: string | null
  email?: string | null
  contatti?: ContattoApi[]
}

export type PartnerTrovato = {
  id: string
  nome: string
  stato: string | null
  citta: string | null
  categoria: string | null
  link: string
}

const linkPartner = (id: string) => `${ANAGRAFICHE_URL}/partner/${id}`

async function getPartners(query: string): Promise<PartnerApi[]> {
  const k = await chiave()
  if (!k) return []
  try {
    const res = await fetch(`${ANAGRAFICHE_URL}/api/v1/partners?${query}`, {
      headers: { 'x-api-key': k },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const body = (await res.json().catch(() => null)) as { dati?: PartnerApi[] } | null
    return Array.isArray(body?.dati) ? body!.dati! : []
  } catch {
    return []
  }
}

/** L'azienda a cui appartiene UN indirizzo email (match esatto su email o
 *  su un contatto). null se non è in Anagrafiche. */
export async function partnerPerEmail(email: string): Promise<PartnerTrovato | null> {
  const e = email.trim().toLowerCase()
  if (!e) return null
  const dati = await getPartners(`q=${encodeURIComponent(e)}&perPage=15`)
  const p = dati.find(
    (x) =>
      (x.email || '').toLowerCase() === e ||
      (x.contatti || []).some((c) => (c.email || '').toLowerCase() === e)
  )
  return p ? { id: p.id, nome: p.nome, stato: p.stato ?? null, citta: p.citta ?? null, categoria: p.categoria ?? null, link: linkPartner(p.id) } : null
}

/** Ricerca libera per la UI di associazione (per nome, città, ecc.). */
export async function cercaPartner(q: string): Promise<PartnerTrovato[]> {
  const testo = q.trim()
  if (testo.length < 2) return []
  const dati = await getPartners(`q=${encodeURIComponent(testo)}&perPage=12`)
  return dati.map((p) => ({ id: p.id, nome: p.nome, stato: p.stato ?? null, citta: p.citta ?? null, categoria: p.categoria ?? null, link: linkPartner(p.id) }))
}

// ---- Indice dei CLIENTI (stato "attivo") per la riconciliazione della posta ----

type IndiceClienti = {
  at: number
  perEmail: Map<string, { id: string; nome: string }>
  perDominio: Map<string, { id: string; nome: string }>
}
let cache: IndiceClienti | null = null
const TTL = 10 * 60 * 1000 // 10 minuti

/** Costruisce (o riusa dalla cache) l'indice dei clienti: email esatte e domini. */
export async function indiceClienti(): Promise<IndiceClienti> {
  if (cache && Date.now() - cache.at < TTL) return cache
  const perEmail = new Map<string, { id: string; nome: string }>()
  const perDominio = new Map<string, { id: string; nome: string }>()
  const k = await chiave()
  if (k) {
    for (let page = 1; page <= 20; page++) {
      const dati = await getPartners(`stato=attivo&perPage=100&page=${page}`)
      if (dati.length === 0) break
      for (const p of dati) {
        const rif = { id: p.id, nome: p.nome }
        const emails = [p.email, ...(p.contatti || []).map((c) => c.email)]
          .filter((x): x is string => Boolean(x))
          .map((x) => x.toLowerCase())
        for (const em of emails) {
          if (!perEmail.has(em)) perEmail.set(em, rif)
          const dom = em.split('@')[1]
          // Il dominio associa solo se NON è un provider generico (gmail, ecc.):
          // altrimenti "un cliente su gmail" trascinerebbe mezzo mondo.
          if (dom && !DOMINI_GENERICI.has(dom) && !perDominio.has(dom)) perDominio.set(dom, rif)
        }
      }
      if (dati.length < 100) break
    }
  }
  cache = { at: Date.now(), perEmail, perDominio }
  return cache
}

const DOMINI_GENERICI = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.it', 'live.com',
  'libero.it', 'virgilio.it', 'alice.it', 'yahoo.com', 'yahoo.it', 'icloud.com', 'pec.it',
  'tin.it', 'tiscali.it', 'aruba.it', 'me.com',
])

/** Il cliente (azienda in Anagrafiche, stato attivo) a cui appartiene un mittente,
 *  per email esatta o per dominio. null se non è un cliente. */
export async function clientePerMittente(mittente: string): Promise<{ id: string; nome: string } | null> {
  const e = mittente.trim().toLowerCase()
  if (!e) return null
  const idx = await indiceClienti()
  return idx.perEmail.get(e) || idx.perDominio.get(e.split('@')[1] || '') || null
}

/** Associa un'email (come contatto) a un'azienda esistente in Anagrafiche.
 *  Serve una chiave con permesso di scrittura. */
export async function associaEmailAPartner(
  partnerId: string,
  email: string,
  nome?: string
): Promise<{ ok: boolean; messaggio: string }> {
  const k = await chiave()
  if (!k) return { ok: false, messaggio: 'Anagrafiche non collegata: manca la chiave.' }
  try {
    const res = await fetch(`${ANAGRAFICHE_URL}/api/v1/partners/${encodeURIComponent(partnerId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-api-key': k },
      body: JSON.stringify({ contatti: [{ email: email.trim().toLowerCase(), nome: nome || '', ruolo: '', telefono: '' }] }),
      signal: AbortSignal.timeout(12000),
    })
    if (res.ok) {
      cache = null // l'indice va rifatto: nuova email associata
      return { ok: true, messaggio: 'Contatto associato all’azienda in Anagrafiche.' }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, messaggio: 'La chiave Anagrafiche è di sola lettura: non posso scrivere.' }
    return { ok: false, messaggio: `Anagrafiche ha risposto ${res.status}.` }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    return { ok: false, messaggio: `Associazione non riuscita: ${m.slice(0, 100)}` }
  }
}

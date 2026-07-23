// Integrazione con il registro centralizzato Anagrafiche (deluxy-anagrafiche):
// serve a) a dire se un contatto è un'azienda registrata, b) a riconciliare la
// posta con i CLIENTI (partner con stato "attivo") per email o per dominio.
//
// Sola lettura per l'elenco/ricerca; la scrittura (associare un'email a
// un'azienda) usa la stessa chiave: se è di sola lettura, il server risponde 401/403.

import { leggiChiaviApp } from './chiaviApp'

const ANAGRAFICHE_URL = (process.env.ANAGRAFICHE_URL || 'https://deluxy-anagrafiche.vercel.app').replace(/\/$/, '')

// Le chiavi vivono nelle env di Vercel (mai nel codice):
//   ANAGRAFICHE_PARTNER_KEY  → sola lettura (elenco/ricerca/riconciliazione)
//   ANAGRAFICHE_WRITE_KEY    → scrittura (associare un'email a un'azienda)
// In mancanza, si ripiega sulla chiave "anagrafiche" del vault del Hub.
async function chiaveLettura(): Promise<string> {
  const env = (process.env.ANAGRAFICHE_PARTNER_KEY || process.env.ANAGRAFICHE_API_KEY || '').trim()
  if (env) return env
  try {
    const chiavi = await leggiChiaviApp()
    return chiavi.anagrafiche || ''
  } catch {
    return ''
  }
}

async function chiaveScrittura(): Promise<string> {
  const env = (process.env.ANAGRAFICHE_WRITE_KEY || '').trim()
  if (env) return env
  // Se non c'è una chiave di scrittura dedicata, si tenta con quella di lettura
  // (il server rifiuterà con 401/403 se non ha i permessi).
  return chiaveLettura()
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

export const linkPartner = (id: string) => `${ANAGRAFICHE_URL}/partner/${id}`

async function getPartners(query: string): Promise<PartnerApi[]> {
  const k = await chiaveLettura()
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
let inCorso: Promise<IndiceClienti> | null = null
const TTL = 30 * 60 * 1000 // 30 minuti: i clienti cambiano di rado
// Quanto al massimo la POSTA può aspettare l'indice quando non è ancora in
// memoria. Oltre, si va avanti senza badge e l'indice si finisce di costruire
// in sottofondo: pronto alla navigazione successiva.
const ATTESA_MAX = 1200

const VUOTO = (): IndiceClienti => ({ at: 0, perEmail: new Map(), perDominio: new Map() })

/** Scarica davvero l'elenco dei clienti attivi e ne costruisce l'indice. */
async function costruisciIndice(): Promise<IndiceClienti> {
  const perEmail = new Map<string, { id: string; nome: string }>()
  const perDominio = new Map<string, { id: string; nome: string }>()
  const k = await chiaveLettura()
  if (k) {
    // Cap a 10 pagine (1000 clienti): oltre, il costo non vale il badge.
    for (let page = 1; page <= 10; page++) {
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

/**
 * L'indice dei clienti: email esatte e domini. **Non blocca mai a lungo la
 * pagina che lo usa**: se in memoria c'è una copia (anche scaduta) la ritorna
 * subito e la aggiorna in sottofondo; se non c'è nulla aspetta al massimo
 * ATTESA_MAX, poi va avanti senza. Una fetch di 10 pagine ad Anagrafiche dentro
 * il render della posta costava secondi a ogni navigazione.
 */
export async function indiceClienti(): Promise<IndiceClienti> {
  const fresca = cache && Date.now() - cache.at < TTL
  if (fresca) return cache!

  // Un solo aggiornamento alla volta, anche con più richieste in parallelo.
  if (!inCorso) {
    inCorso = costruisciIndice()
      .catch(() => cache ?? VUOTO())
      .finally(() => {
        inCorso = null
      })
  }
  const lavoro = inCorso

  // C'è una copia vecchia: si usa quella e si aggiorna in sottofondo.
  if (cache) return cache

  // Primo giro assoluto: si concede solo un'attesa breve.
  const scaduto = Symbol('scaduto')
  const esito = await Promise.race([
    lavoro,
    new Promise<typeof scaduto>((r) => setTimeout(() => r(scaduto), ATTESA_MAX)),
  ])
  return esito === scaduto ? VUOTO() : (esito as IndiceClienti)
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

/** Il percorso inverso di clientePerMittente: dato un cliente (id di Anagrafiche
 *  oppure nome, anche parziale), tutti gli indirizzi e i domini che l'indice gli
 *  associa. Serve a pescare in un colpo solo TUTTA la posta di quell'azienda,
 *  senza sapere da quale casella scrive la persona che ci ha scritto.
 *
 *  Attenzione: l'indice è costruito dagli indirizzi noti al registro, quindi un
 *  cliente senza nessuna email in Anagrafiche non è trovabile (torna null). */
export async function recapitiCliente(
  rif: string
): Promise<{ cliente: { id: string; nome: string }; email: string[]; domini: string[] } | null> {
  const r = rif.trim().toLowerCase()
  if (!r) return null
  const idx = await indiceClienti()
  const tutti = [...idx.perEmail.values(), ...idx.perDominio.values()]

  // prima id esatto, poi nome esatto, infine nome parziale ("rossi" → "Fiori Rossi srl")
  let cliente =
    tutti.find((v) => v.id.toLowerCase() === r) ??
    tutti.find((v) => v.nome.trim().toLowerCase() === r) ??
    tutti.find((v) => v.nome.toLowerCase().includes(r)) ??
    null
  if (!cliente) return null

  const email = [...idx.perEmail].filter(([, v]) => v.id === cliente!.id).map(([k]) => k)
  const domini = [...idx.perDominio].filter(([, v]) => v.id === cliente!.id).map(([k]) => k)
  return { cliente, email, domini }
}

/** Associa un'email (come contatto) a un'azienda esistente in Anagrafiche.
 *  Serve una chiave con permesso di scrittura. */
export async function associaEmailAPartner(
  partnerId: string,
  email: string,
  nome?: string
): Promise<{ ok: boolean; messaggio: string }> {
  const k = await chiaveScrittura()
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

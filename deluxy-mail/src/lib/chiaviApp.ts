import { db } from './db'
import { cifra, decifra } from './crypto'

// Le chiavi con cui AI Mail parla con le altre app Deluxy. TRE sorgenti, in
// ordine di precedenza:
//   1. quella inserita dall'utente in Impostazioni App (CIFRATA nel database);
//   2. la CASSAFORTE CENTRALE di deluxy-hub (GET /api/chiavi, cassaforte comune
//      a tutte le app: così le chiavi si gestiscono in un posto solo);
//   3. la variabile d'ambiente su Vercel (fallback storico).
// Il hub si attiva impostando su Vercel HUB_KEYS_TOKEN (lo stesso token del hub)
// e, se serve, HUB_URL. Senza token, si ignora e resta il vecchio comportamento.

export type NomeChiaveApp = 'anagrafiche' | 'finance' | 'fornitori' | 'commerciale'
export type ChiaviApp = Record<NomeChiaveApp, string>

const MAPPA: Record<NomeChiaveApp, { impostazione: string; env: string }> = {
  anagrafiche: { impostazione: 'app.anagrafiche.key', env: 'ANAGRAFICHE_API_KEY' },
  finance: { impostazione: 'app.finance.key', env: 'FINANCE_API_KEY' },
  fornitori: { impostazione: 'app.fornitori.key', env: 'FORNITORI_PASSWORD' },
  commerciale: { impostazione: 'app.commerciale.key', env: 'COMMERCIALE_API_KEY' },
}

const NOMI = Object.keys(MAPPA) as NomeChiaveApp[]

// Nome del progetto con cui AI Mail è registrata nella cassaforte del hub: le
// chiavi vanno messe lì sotto questo progetto, con i nomi env qui sopra.
const PROGETTO_HUB = 'deluxy-mail'

/**
 * Chiede a deluxy-hub le chiavi di AI Mail (cassaforte centrale). Ritorna una
 * mappa NOME→valore in chiaro, o {} se il hub non è configurato/raggiungibile
 * (in quel caso si usa il resto). Non fa mai fallire la lettura delle chiavi.
 */
// Le chiavi cambiano molto di rado: si tengono in memoria 5 minuti. Senza
// questa cache ogni apertura della posta in arrivo faceva una fetch al hub
// (rete USA→Europa) DENTRO il render, e si vedeva.
let cacheHub: { at: number; chiavi: Record<string, string> } | null = null
const TTL_HUB = 5 * 60 * 1000

async function chiaviDalHub(): Promise<Record<string, string>> {
  const token = (process.env.HUB_KEYS_TOKEN || '').trim()
  if (token.length < 16) return {} // cassaforte spenta finché non c'è il token
  if (cacheHub && Date.now() - cacheHub.at < TTL_HUB) return cacheHub.chiavi
  const base = (process.env.HUB_URL || 'https://deluxy-hub.vercel.app').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/api/chiavi?progetto=${encodeURIComponent(PROGETTO_HUB)}`, {
      headers: { 'X-Hub-Token': token },
      cache: 'no-store',
      // Il hub non deve mai far aspettare la posta: se tarda si usa il resto.
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return cacheHub?.chiavi ?? {}
    const dati = (await res.json()) as { chiavi?: Record<string, string> }
    const chiavi = dati.chiavi ?? {}
    cacheHub = { at: Date.now(), chiavi }
    return chiavi
  } catch {
    // Rete/hub giù: si riusa l'ultima risposta buona, se c'è.
    return cacheHub?.chiavi ?? {}
  }
}

/** Da chiamare quando l'utente cambia una chiave: l'effetto è immediato. */
export function svuotaCacheChiavi(): void {
  cacheHub = null
}

/** Tutte le chiavi risolte (locale cifrato → hub → env). Vuota se non impostata. */
export async function leggiChiaviApp(): Promise<ChiaviApp> {
  let righe: { chiave: string; valore: string }[] = []
  try {
    righe = await db.impostazione.findMany({
      where: { chiave: { in: NOMI.map((n) => MAPPA[n].impostazione) } },
    })
  } catch {
    righe = [] // tabella non raggiungibile: si usano hub/env
  }
  const perChiave = new Map(righe.map((r) => [r.chiave, r.valore]))
  const dalHub = await chiaviDalHub()

  const risolvi = (n: NomeChiaveApp): string => {
    // 1. override locale, se l'utente l'ha messo in Impostazioni App.
    const cifrato = perChiave.get(MAPPA[n].impostazione)
    if (cifrato) {
      try {
        const v = decifra(cifrato).trim()
        if (v) return v
      } catch {
        /* chiave cifrata illeggibile (APP_SECRET cambiato?): si prova oltre */
      }
    }
    // 2. cassaforte centrale del hub.
    const dalVault = (dalHub[MAPPA[n].env] || '').trim()
    if (dalVault) return dalVault
    // 3. variabile d'ambiente locale.
    return (process.env[MAPPA[n].env] || '').trim()
  }

  return {
    anagrafiche: risolvi('anagrafiche'),
    finance: risolvi('finance'),
    fornitori: risolvi('fornitori'),
    commerciale: risolvi('commerciale'),
  }
}

/** Salva (cifrata) la chiave inserita dall'utente. Vuota = la si toglie e si
 *  torna alla variabile d'ambiente, se c'è. */
export async function salvaChiaveApp(nome: NomeChiaveApp, valore: string): Promise<void> {
  const k = MAPPA[nome].impostazione
  const v = valore.trim()
  if (!v) {
    await db.impostazione.deleteMany({ where: { chiave: k } })
    return
  }
  await db.impostazione.upsert({
    where: { chiave: k },
    create: { chiave: k, valore: cifra(v) },
    update: { valore: cifra(v) },
  })
}

export type StatoChiave = { daApp: boolean; daHub: boolean; daEnv: boolean }

/** Per la UI: da dove viene ogni chiave, SENZA mai esporne il valore. */
export async function statoChiaviApp(): Promise<Record<NomeChiaveApp, StatoChiave>> {
  let impostate = new Set<string>()
  try {
    const righe = await db.impostazione.findMany({
      where: { chiave: { in: NOMI.map((n) => MAPPA[n].impostazione) } },
      select: { chiave: true },
    })
    impostate = new Set(righe.map((r) => r.chiave))
  } catch {
    impostate = new Set()
  }
  const dalHub = await chiaviDalHub()
  const stato = {} as Record<NomeChiaveApp, StatoChiave>
  for (const n of NOMI) {
    stato[n] = {
      daApp: impostate.has(MAPPA[n].impostazione),
      daHub: (dalHub[MAPPA[n].env] || '').trim().length > 0,
      daEnv: (process.env[MAPPA[n].env] || '').trim().length > 0,
    }
  }
  return stato
}

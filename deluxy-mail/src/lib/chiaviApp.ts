import { db } from './db'
import { cifra, decifra } from './crypto'

// Le chiavi con cui AI Mail parla con le altre app Deluxy. Due sorgenti, in
// ordine: quella inserita dall'utente in Impostazioni App (salvata CIFRATA nel
// database, come le password IMAP) e, in mancanza, la variabile d'ambiente su
// Vercel. Così la chiave si può mettere dall'app senza toccare i segreti del
// server, ma chi preferisce le env continua a poterle usare.

export type NomeChiaveApp = 'anagrafiche' | 'finance' | 'fornitori'
export type ChiaviApp = Record<NomeChiaveApp, string>

const MAPPA: Record<NomeChiaveApp, { impostazione: string; env: string }> = {
  anagrafiche: { impostazione: 'app.anagrafiche.key', env: 'ANAGRAFICHE_API_KEY' },
  finance: { impostazione: 'app.finance.key', env: 'FINANCE_API_KEY' },
  fornitori: { impostazione: 'app.fornitori.key', env: 'FORNITORI_PASSWORD' },
}

const NOMI = Object.keys(MAPPA) as NomeChiaveApp[]

/** Tutte le chiavi risolte (DB cifrato → env). Stringa vuota se non impostata. */
export async function leggiChiaviApp(): Promise<ChiaviApp> {
  let righe: { chiave: string; valore: string }[] = []
  try {
    righe = await db.impostazione.findMany({
      where: { chiave: { in: NOMI.map((n) => MAPPA[n].impostazione) } },
    })
  } catch {
    righe = [] // tabella non raggiungibile: si usano solo le env
  }
  const perChiave = new Map(righe.map((r) => [r.chiave, r.valore]))

  const risolvi = (n: NomeChiaveApp): string => {
    const cifrato = perChiave.get(MAPPA[n].impostazione)
    if (cifrato) {
      try {
        return decifra(cifrato).trim()
      } catch {
        /* chiave cifrata illeggibile (APP_SECRET cambiato?): si prova l'env */
      }
    }
    return (process.env[MAPPA[n].env] || '').trim()
  }

  return { anagrafiche: risolvi('anagrafiche'), finance: risolvi('finance'), fornitori: risolvi('fornitori') }
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

export type StatoChiave = { daApp: boolean; daEnv: boolean }

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
  const stato = {} as Record<NomeChiaveApp, StatoChiave>
  for (const n of NOMI) {
    stato[n] = {
      daApp: impostate.has(MAPPA[n].impostazione),
      daEnv: (process.env[MAPPA[n].env] || '').trim().length > 0,
    }
  }
  return stato
}

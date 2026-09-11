import { leggiImpostazioni, salvaImpostazione } from './impostazioni'
import { transactionsConfigurata } from './transactions'

/**
 * ⭐ 11/09/2026 — LE APP SORELLE, IN UN POSTO SOLO.
 *
 * Richiesta dell'utente, nata da un guaio vero: una sessione di Transactions
 * non era riuscita a chiudere 41 richieste perché «deluxy-messaging/.env non ha
 * la chiave — vive solo sul suo Vercel». Verificato: il `.env` locale non ha
 * NESSUNA chiave verso le app sorelle, e le schermate per metterle erano
 * sparse in cinque riquadri diversi di Impostazioni, ognuno con parole sue.
 *
 * Qui si vede, per ogni app: dove abita la chiave, se c'è, e — premendo
 * «Prova» — se risponde davvero.
 *
 * ⚠️⚠️ «CONFIGURATA» E «FUNZIONA» NON SONO LA STESSA COSA. È la lezione che
 * Scout ha già pagato (registro, 03/09/2026: la pillola verde si accendeva
 * appena si incollava qualcosa, e nella riga della piattaforma c'era un IBAN al
 * posto della chiave). Per questo lo stato ha quattro valori e il verde lo
 * accende solo una prova riuscita.
 */
export type StatoCollegamento = 'da-collegare' | 'da-provare' | 'non-risponde' | 'collegata'

export type AppSorella = {
  chiave: string
  nome: string
  /** A che cosa serve qui dentro: chi legge deve sapere cosa si rompe senza. */
  aCosaServe: string
  /** Le impostazioni in cui vivono indirizzo e chiave (tabella `Impostazione`). */
  chiaveUrl: string
  chiaveApi: string
  urlDefault: string
  /**
   * ⚠️⚠️ Vero quando le credenziali stanno SOLO nell'ambiente e non nel
   * database. Per Transactions è una decisione scritta nel suo client: sono le
   * credenziali che fanno uscire denaro, e il database è condiviso con altre
   * tredici app. Da qui si vede se ci sono e si prova il collegamento; per
   * metterle si passa dall'ambiente, e la schermata dice come.
   */
  soloAmbiente?: boolean
  /** Il percorso da chiamare per la prova: deve rispondere 200 con la chiave. */
  provaPercorso: string
}

export const APP_SORELLE: AppSorella[] = [
  {
    chiave: 'orders',
    nome: 'Deluxy Orders',
    aCosaServe:
      'Il registro degli ordini: da lì arrivano gli ordini da lavorare e le schede più vecchie di quelle scaricate da Shopify.',
    chiaveUrl: 'ordersUrl',
    chiaveApi: 'ordersApiKey',
    urlDefault: 'https://deluxy-orders.vercel.app',
    provaPercorso: '/api/v1/ordini?limite=1',
  },
  {
    chiave: 'piattaforma',
    nome: 'Piattaforma consegne',
    aCosaServe:
      'Le consegne: «Manda in app», lo stato di una consegna, il calendario dei partner e la segnalazione di un reclamo.',
    chiaveUrl: 'piattaformaUrl',
    chiaveApi: 'piattaformaApiKey',
    urlDefault: 'https://app.deluxy.it',
    provaPercorso: '/api/v1/app/partner?limite=1',
  },
  {
    chiave: 'anagrafiche',
    nome: 'Registro Anagrafiche',
    aCosaServe: 'I partner B2B: la pagina Partner & Fornitori e i recapiti che si propongono nei moduli.',
    chiaveUrl: 'anagraficheUrl',
    chiaveApi: 'anagraficheApiKey',
    urlDefault: 'https://deluxy-anagrafiche.vercel.app',
    provaPercorso: '/api/v1/partners?limit=1',
  },
  {
    chiave: 'merchandising',
    nome: 'Merchandising',
    aCosaServe: 'La scheda del prodotto che si apre dal dettaglio di un ordine.',
    chiaveUrl: 'merchandisingUrl',
    chiaveApi: 'merchandisingApiKey',
    urlDefault: 'https://deluxy-merchandising.vercel.app',
    provaPercorso: '/api/v1/prodotti?limite=1',
  },
  {
    chiave: 'transactions',
    nome: 'Deluxy Transactions',
    aCosaServe:
      'L’unica app da cui esce denaro: il «Paga fornitore» manda lì la richiesta, e quando qui si segna «Pagata» la chiude nella loro coda.',
    chiaveUrl: 'transactionsUrl',
    chiaveApi: 'transactionsApiKey',
    urlDefault: 'https://deluxy-transactions.vercel.app',
    soloAmbiente: true,
    // ⚠️ La prova di Transactions non passa da qui: le sue chiamate sono
    // FIRMATE (HMAC) e la firma la sa fare solo il suo client. Vedi `provaApp`.
    provaPercorso: '/api/v1/richieste?limite=1',
  },
]

export type RigaApp = AppSorella & {
  url: string
  /** ⚠️ Mai la chiave: solo se c'è. Un segreto non torna mai a schermo. */
  haChiave: boolean
  /** Dove sta la chiave adesso: nell'ambiente o nel database. */
  dove: 'ambiente' | 'database' | 'nessuna'
  stato: StatoCollegamento
  provataIl: string
  provaEsito: string
}

/** Le variabili d'ambiente che valgono più del database, app per app. */
const AMBIENTE: Record<string, { url?: string; api?: string }> = {
  orders: { url: 'ORDERS_URL', api: 'ORDERS_API_KEY' },
  piattaforma: { url: 'PIATTAFORMA_URL', api: 'PIATTAFORMA_API_KEY' },
  anagrafiche: { url: 'ANAGRAFICHE_URL', api: 'ANAGRAFICHE_API_KEY' },
  merchandising: { url: 'MERCH_URL', api: 'MERCH_API_KEY' },
  transactions: { url: 'TRANSACTIONS_URL', api: 'TRANSACTIONS_API_KEY' },
}

/** Le chiavi in cui si scrive l'esito dell'ultima prova (in chiaro: non è un segreto). */
const chiaveEsito = (a: string) => `collegamento_${a}_esito`
const chiaveProvata = (a: string) => `collegamento_${a}_provata`

export async function statoAppCollegate(): Promise<RigaApp[]> {
  const chiavi = APP_SORELLE.flatMap((a) => [a.chiaveUrl, a.chiaveApi, chiaveEsito(a.chiave), chiaveProvata(a.chiave)])
  const c = await leggiImpostazioni(chiavi)
  return APP_SORELLE.map((a) => {
    const env = AMBIENTE[a.chiave] ?? {}
    const envApi = ((env.api && process.env[env.api]) ?? '').trim()
    const envUrl = ((env.url && process.env[env.url]) ?? '').trim()
    // ⚠️ Transactions si chiede a sé stessa: le sue credenziali sono due
    // (chiave + segreto della firma) e servono tutt'e due.
    const haChiave = a.chiave === 'transactions' ? transactionsConfigurata() : Boolean(envApi || c[a.chiaveApi])
    const dove: RigaApp['dove'] = !haChiave ? 'nessuna' : envApi || a.soloAmbiente ? 'ambiente' : 'database'
    const esito = c[chiaveEsito(a.chiave)] ?? ''
    const provataIl = c[chiaveProvata(a.chiave)] ?? ''
    // ⚠️⚠️ Il verde solo dopo una prova riuscita. «C'è una chiave» non vuol
    // dire «risponde»: una chiave scaduta, revocata o di un'altra app sta lì
    // uguale, e la schermata direbbe che va tutto bene.
    const stato: StatoCollegamento = !haChiave
      ? 'da-collegare'
      : esito === 'ok'
        ? 'collegata'
        : esito
          ? 'non-risponde'
          : 'da-provare'
    return {
      ...a,
      url: envUrl || c[a.chiaveUrl] || a.urlDefault,
      haChiave,
      dove,
      stato,
      provataIl,
      provaEsito: esito === 'ok' ? '' : esito,
    }
  })
}

/**
 * Prova davvero il collegamento: una chiamata di sola lettura, con la chiave.
 *
 * ⚠️ Si guarda anche il CORPO, non solo il codice: un'app che risponde 200 con
 * la pagina di login non è collegata — è la trappola che Orders ha già preso
 * («a quello risponde anche un'app che non ha il permesso di leggere»).
 */
export async function provaApp(chiave: string): Promise<{ ok: boolean; messaggio: string }> {
  const a = APP_SORELLE.find((x) => x.chiave === chiave)
  if (!a) return { ok: false, messaggio: 'App sconosciuta.' }

  let esito: { ok: boolean; messaggio: string }
  if (a.chiave === 'transactions') {
    // ⚠️ Le chiamate a Transactions sono firmate: la prova la fa il suo client,
    // che è l'unico che sa firmare. Qui si chiede lo stato di una richiesta
    // che non esiste: se le credenziali valgono, risponde lo stesso.
    const { provaCollegamentoTransactions } = await import('./transactions')
    esito = await provaCollegamentoTransactions()
  } else {
    const c = await leggiImpostazioni([a.chiaveUrl, a.chiaveApi])
    const env = AMBIENTE[a.chiave] ?? {}
    const apiKey = ((env.api && process.env[env.api]) ?? '').trim() || c[a.chiaveApi]
    const base = (((env.url && process.env[env.url]) ?? '').trim() || c[a.chiaveUrl] || a.urlDefault).replace(/\/$/, '')
    if (!apiKey) {
      esito = { ok: false, messaggio: 'Non c’è nessuna chiave: non c’è niente da provare.' }
    } else {
      try {
        const r = await fetch(`${base}${a.provaPercorso}`, {
          headers: { 'x-api-key': apiKey, Accept: 'application/json' },
          cache: 'no-store',
          signal: AbortSignal.timeout(12_000),
        })
        const tipo = r.headers.get('content-type') ?? ''
        if (r.ok && tipo.includes('json')) esito = { ok: true, messaggio: `Risponde (${r.status}).` }
        else if (r.ok) esito = { ok: false, messaggio: `Risponde ${r.status} ma non in JSON: l’indirizzo porta a una pagina, non all’API.` }
        else if (r.status === 401 || r.status === 403) esito = { ok: false, messaggio: `Chiave rifiutata (${r.status}).` }
        else esito = { ok: false, messaggio: `Ha risposto ${r.status}.` }
      } catch (e) {
        esito = { ok: false, messaggio: `Non risponde: ${(e as Error).message}` }
      }
    }
  }

  // L'esito resta SCRITTO: la schermata di Scout lo perdeva chiudendola, e la
  // volta dopo nessuno sapeva più se quella prova fosse mai stata fatta.
  await salvaImpostazione(chiaveEsito(a.chiave), esito.ok ? 'ok' : esito.messaggio.slice(0, 300))
  await salvaImpostazione(chiaveProvata(a.chiave), new Date().toISOString())
  return esito
}

/**
 * Salva indirizzo e chiave di un'app.
 *
 * ⚠️ Chiave vuota = «non l'ho toccata», come in tutte le schermate di
 * Impostazioni: un campo segreto rimandato vuoto dal browser non deve
 * cancellare quello che c'è. Per toglierla c'è `svuota`.
 * ⚠️⚠️ Un'app `soloAmbiente` non si scrive da qui: le sue credenziali fanno
 * uscire denaro e stanno nell'ambiente, non nel database condiviso.
 */
export async function salvaApp(
  chiave: string,
  d: { url?: string; apiKey?: string; svuota?: boolean }
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const a = APP_SORELLE.find((x) => x.chiave === chiave)
  if (!a) return { ok: false, errore: 'App sconosciuta.' }
  if (a.soloAmbiente) {
    return {
      ok: false,
      errore:
        'Le credenziali di questa app non si scrivono qui: fanno uscire denaro e vivono solo nell’ambiente (vedi la scheda).',
    }
  }
  if (typeof d.url === 'string' && d.url.trim()) {
    if (!/^https:\/\/[a-z0-9.-]+/i.test(d.url.trim())) return { ok: false, errore: 'L’indirizzo deve cominciare con https://' }
    await salvaImpostazione(a.chiaveUrl, d.url.trim().replace(/\/$/, ''))
  }
  if (d.svuota) await salvaImpostazione(a.chiaveApi, '')
  else if (typeof d.apiKey === 'string' && d.apiKey.trim()) await salvaImpostazione(a.chiaveApi, d.apiKey.trim())
  // ⚠️ Cambiata la chiave, l'esito di prima non vale più: si azzera, e lo
  // stato torna «da provare» invece di restare verde per una chiave diversa.
  if (d.svuota || (d.apiKey ?? '').trim()) {
    await salvaImpostazione(chiaveEsito(a.chiave), '')
    await salvaImpostazione(chiaveProvata(a.chiave), '')
  }
  return { ok: true }
}

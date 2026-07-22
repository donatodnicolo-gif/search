// APP DELUXY — il catalogo delle funzioni delle altre app che AI Mail può
// richiamare a partire da una mail. Ogni azione dichiara: lo schema dei dati
// che l'AI deve estrarre dalla mail, e come eseguire la chiamata HTTP.
//
// Regola di prodotto: l'AI PREPARA i dati, l'utente li vede e CONFERMA.
// Niente parte da solo.

import type { RegolaApp } from '@prisma/client'
import type { ChiaviApp, NomeChiaveApp } from './chiaviApp'
import { condizioneSoddisfatta } from './condizioni'

// ---------- Configurazione (env su Vercel; i default sono gli URL pubblici) ----------
// Solo gli URL vengono dall'ambiente: non sono segreti. Le CHIAVI arrivano dal
// resolver (chiaviApp.ts: DB cifrato → env) e sono passate a ogni azione via ctx.

const ANAGRAFICHE_URL = (process.env.ANAGRAFICHE_URL || 'https://deluxy-anagrafiche.vercel.app').replace(/\/$/, '')
const FINANCE_URL = (process.env.FINANCE_URL || 'https://deluxy-partner.vercel.app').replace(/\/$/, '')
const FORNITORI_URL = (process.env.FORNITORI_URL || 'https://search-deluxy.vercel.app').replace(/\/$/, '')
const COMMERCIALE_URL = (process.env.COMMERCIALE_URL || 'https://fdsziebgkljfsugqqbqd.supabase.co/functions/v1').replace(/\/$/, '')

/** Qual è la chiave (fra quelle di ChiaviApp) che serve a ciascuna app. */
export const CHIAVE_DI_APP: Record<string, NomeChiaveApp> = {
  Anagrafiche: 'anagrafiche',
  Finance: 'finance',
  Fornitori: 'fornitori',
  Commerciale: 'commerciale',
}

// ---------- Tipi ----------

export type EsitoAzione = { ok: boolean; messaggio: string; link?: string }

/** Contesto passato a un'azione: chi la esegue (header/log) e la sua chiave. */
export type ContestoAzione = { utenteEmail?: string; chiave: string }

export type AzioneApp = {
  id: string
  app: string // nome dell'app di destinazione (come nel portale)
  nome: string // cosa fa, in due parole
  descrizione: string
  colore: string // colore del badge (classi del design system)
  /** JSON Schema strict dei dati che l'AI estrae dalla mail. */
  schema: Record<string, unknown>
  /** Guida per l'AI su come compilare i dati. */
  guida: string
  esegui: (dati: Record<string, unknown>, ctx: ContestoAzione) => Promise<EsitoAzione>
}

/** La chiave che serve a un'azione, o stringa vuota se l'app non ne mappa una. */
export function chiaveDiAzione(azione: AzioneApp, chiavi: ChiaviApp): string {
  const nome = CHIAVE_DI_APP[azione.app]
  return nome ? chiavi[nome] : ''
}

// ---------- Helpers HTTP ----------

async function chiama(
  url: string,
  init: RequestInit,
  leggiEsito: (status: number, body: unknown) => EsitoAzione
): Promise<EsitoAzione> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      /* risposta senza JSON */
    }
    return leggiEsito(res.status, body)
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    if (/abort|timeout/i.test(m)) return { ok: false, messaggio: 'L’app non risponde (timeout).' }
    return { ok: false, messaggio: `Chiamata non riuscita: ${m.slice(0, 100)}` }
  }
}

const testoErrore = (body: unknown, fallback: string) => {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    const m = b.errore ?? b.error ?? b.message ?? b.messaggio
    if (typeof m === 'string' && m) return m.slice(0, 160)
  }
  return fallback
}

// ---------- Le azioni ----------

const AZIONI: AzioneApp[] = [
  {
    id: 'anagrafiche.partner',
    app: 'Anagrafiche',
    nome: 'Registra contatto',
    descrizione: 'Crea o aggiorna il partner/prospect nel registro centralizzato.',
    colore: 'blue',
    guida:
      'Estrai i dati anagrafici dell’AZIENDA che scrive (non di Deluxy). nome = ragione sociale o nome commerciale. Se un dato non è nella mail, null: MAI inventare.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['nome', 'categoria', 'citta', 'provincia', 'indirizzo', 'email', 'telefono', 'pIva', 'referenteNome', 'referenteRuolo', 'note'],
      properties: {
        nome: { type: 'string', description: 'Nome dell’azienda/attività.' },
        categoria: { type: ['string', 'null'], description: 'Es. hotel, ristorante, fioraio, pasticceria.' },
        citta: { type: ['string', 'null'] },
        provincia: { type: ['string', 'null'], description: 'Sigla, es. MI.' },
        indirizzo: { type: ['string', 'null'] },
        email: { type: ['string', 'null'], description: 'Email di contatto (di norma il mittente).' },
        telefono: { type: ['string', 'null'] },
        pIva: { type: ['string', 'null'] },
        referenteNome: { type: ['string', 'null'], description: 'Nome della persona che scrive.' },
        referenteRuolo: { type: ['string', 'null'] },
        note: { type: ['string', 'null'], description: 'Cosa chiede / contesto utile, in una frase.' },
      },
    },
    async esegui(dati, ctx) {
      const referente =
        typeof dati.referenteNome === 'string' && dati.referenteNome
          ? [{ nome: dati.referenteNome, ruolo: (dati.referenteRuolo as string) || '', telefono: '', email: (dati.email as string) || '' }]
          : undefined
      const body: Record<string, unknown> = {
        nome: dati.nome,
        categoria: dati.categoria || undefined,
        citta: dati.citta || undefined,
        provincia: dati.provincia || undefined,
        indirizzo: dati.indirizzo || undefined,
        email: dati.email || undefined,
        telefono: dati.telefono || undefined,
        pIva: dati.pIva || undefined,
        note: dati.note || undefined,
        contatti: referente,
        fonte: 'ai-mail',
        sistema: 'deluxy-mail',
        idEsterno: (dati.email as string) || undefined,
      }
      return chiama(
        `${ANAGRAFICHE_URL}/api/v1/partners`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ctx.chiave },
          body: JSON.stringify(body),
        },
        (status, risposta) => {
          if (status === 201) return { ok: true, messaggio: 'Contatto registrato in Anagrafiche.', link: ANAGRAFICHE_URL }
          if (status === 200) return { ok: true, messaggio: 'Contatto già presente: dati aggiornati in Anagrafiche.', link: ANAGRAFICHE_URL }
          if (status === 401 || status === 403)
            return { ok: false, messaggio: 'Chiave Anagrafiche non valida o di sola lettura (serve la chiave di scrittura).' }
          return { ok: false, messaggio: testoErrore(risposta, `Anagrafiche ha risposto ${status}.`) }
        }
      )
    },
  },
  {
    id: 'finance.proforma',
    app: 'Finance',
    nome: 'Crea proforma',
    descrizione: 'Prepara una proforma per il partner in Deluxy Finance.',
    colore: 'gold',
    guida:
      'La mail riguarda servizi/importi da fatturare a un partner. partner = nome dell’azienda. Ogni riga: descrizione del servizio, quantità (1 se non detta), prezzo unitario SOLO se scritto nella mail (altrimenti null: lo completa l’utente).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['partner', 'oggetto', 'righe', 'note'],
      properties: {
        partner: { type: 'string', description: 'Nome del partner a cui intestare la proforma.' },
        oggetto: { type: ['string', 'null'] },
        note: { type: ['string', 'null'] },
        righe: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['descrizione', 'quantita', 'prezzoUnitario'],
            properties: {
              descrizione: { type: 'string' },
              quantita: { type: 'number' },
              prezzoUnitario: { type: ['number', 'null'], description: 'Solo se scritto nella mail.' },
            },
          },
        },
      },
    },
    async esegui(dati, ctx) {
      const righe = Array.isArray(dati.righe) ? (dati.righe as Record<string, unknown>[]) : []
      if (righe.some((r) => r.prezzoUnitario == null))
        return { ok: false, messaggio: 'Manca il prezzo di una riga: completalo prima di inviare.' }
      return chiama(
        `${FINANCE_URL}/api/proforma`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': ctx.chiave, 'X-App': 'deluxy-mail' },
          body: JSON.stringify({
            partner: dati.partner,
            oggetto: dati.oggetto || undefined,
            note: dati.note || undefined,
            righe: righe.map((r) => ({
              descrizione: r.descrizione,
              quantita: typeof r.quantita === 'number' ? r.quantita : 1,
              prezzoUnitario: r.prezzoUnitario,
            })),
          }),
        },
        (status, risposta) => {
          if (status >= 200 && status < 300) {
            const r = (risposta ?? {}) as Record<string, unknown>
            const numero = r.numero ?? (r.proforma as Record<string, unknown> | undefined)?.numero
            return {
              ok: true,
              messaggio: numero ? `Proforma ${numero} creata in Finance.` : 'Proforma creata in Finance.',
              link: FINANCE_URL,
            }
          }
          if (status === 401 || status === 403) return { ok: false, messaggio: 'Chiave Finance non valida.' }
          return { ok: false, messaggio: testoErrore(risposta, `Finance ha risposto ${status}.`) }
        }
      )
    },
  },
  {
    id: 'finance.verifica',
    app: 'Finance',
    nome: 'Verifica partner',
    descrizione: 'Controlla la situazione finanziaria del partner (saldi, fatture).',
    colore: 'green',
    guida: 'Individua il nome dell’azienda partner di cui la mail parla (di norma chi scrive).',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['partner'],
      properties: {
        partner: { type: 'string', description: 'Nome del partner da verificare.' },
      },
    },
    async esegui(dati, ctx) {
      return chiama(
        `${FINANCE_URL}/api/verifiche?partner=${encodeURIComponent(String(dati.partner ?? ''))}`,
        { headers: { 'X-API-Key': ctx.chiave, 'X-App': 'deluxy-mail' } },
        (status, risposta) => {
          if (status >= 200 && status < 300 && risposta && typeof risposta === 'object') {
            // La risposta è un quadro sintetico: la mostriamo com'è, riga per riga.
            const righe = Object.entries(risposta as Record<string, unknown>)
              .filter(([, v]) => v !== null && typeof v !== 'object')
              .map(([k, v]) => `${k}: ${v}`)
              .slice(0, 12)
            return {
              ok: true,
              messaggio: righe.length ? righe.join(' · ') : 'Nessun dato per questo partner.',
              link: FINANCE_URL,
            }
          }
          if (status === 401 || status === 403) return { ok: false, messaggio: 'Chiave Finance non valida.' }
          if (status === 404) return { ok: false, messaggio: 'Partner non trovato in Finance.' }
          return { ok: false, messaggio: testoErrore(risposta, `Finance ha risposto ${status}.`) }
        }
      )
    },
  },
  {
    id: 'fornitori.trova',
    app: 'Fornitori',
    nome: 'Trova fornitore',
    descrizione: 'Trova i fioristi/pasticcerie più vicini alla consegna di un ordine.',
    colore: 'purple',
    guida:
      'La mail è una notifica d’ordine di un negozio Shopify. brand = il dominio del negozio (es. "deluxyflowers.com", "cakedesign.me"): prendilo dal mittente o dal testo. number = il numero d’ordine (solo le cifre, senza "#" o "Ordine"). Se uno dei due manca, lascialo vuoto: senza non si può cercare.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['brand', 'number'],
      properties: {
        brand: { type: 'string', description: 'Dominio del negozio, es. deluxyflowers.com.' },
        number: { type: 'string', description: 'Numero dell’ordine, solo cifre.' },
      },
    },
    async esegui(dati, ctx) {
      const brand = String(dati.brand ?? '').trim()
      const number = String(dati.number ?? '').replace(/[^\d]/g, '')
      if (!brand || !number) return { ok: false, messaggio: 'Servono il negozio e il numero d’ordine.' }

      return chiama(
        `${FORNITORI_URL}/api/fornitori?brand=${encodeURIComponent(brand)}&number=${encodeURIComponent(number)}`,
        {
          headers: {
            'x-app-password': ctx.chiave,
            'x-app-user': ctx.utenteEmail || 'ai-mail',
          },
        },
        (status, risposta) => {
          if (status >= 200 && status < 300 && risposta && typeof risposta === 'object') {
            const r = risposta as {
              fornitori?: {
                nome?: string
                indirizzo?: string
                telefono?: string
                distanzaKm?: number
                minutiAuto?: number
                distanzaTipo?: string
                whatsapp?: string | null
                sito?: string | null
                apertoOra?: boolean | null
                valutazione?: number | null
              }[]
              consegna?: { indirizzo?: string }
              categoria?: string
            }
            const lista = r.fornitori ?? []
            if (lista.length === 0) {
              return { ok: true, messaggio: `Nessun ${r.categoria ?? 'fornitore'} trovato vicino alla consegna.`, link: FORNITORI_URL }
            }
            // Una riga per fornitore, con tutto quello che serve per chiamarlo.
            const righe = lista.map((f, i) => {
              const pezzi: string[] = [`${i + 1}. ${f.nome ?? '—'}`]
              if (f.distanzaKm != null) pezzi.push(`${f.distanzaKm} km${f.minutiAuto != null ? ` · ${f.minutiAuto} min` : ''}${f.distanzaTipo === "linea d'aria" ? " (in linea d'aria)" : ''}`)
              if (f.indirizzo) pezzi.push(f.indirizzo)
              if (f.telefono) pezzi.push(`Tel: ${f.telefono}`)
              if (f.whatsapp) pezzi.push(`WhatsApp: ${f.whatsapp}`)
              if (f.valutazione != null) pezzi.push(`★ ${f.valutazione}`)
              if (f.apertoOra === true) pezzi.push('aperto ora')
              return pezzi.join('\n   ')
            })
            const dove = r.consegna?.indirizzo ? `Consegna a ${r.consegna.indirizzo}\n\n` : ''
            return { ok: true, messaggio: `${dove}${righe.join('\n\n')}`, link: FORNITORI_URL }
          }
          if (status === 401 || status === 403)
            return {
              ok: false,
              messaggio:
                'Password Fornitori rifiutata. Deve essere la password AMMINISTRATORE dell’app Fornitori (search-deluxy) — non il tuo codice utente del sito. Reimpostala in Impostazioni App.',
            }
          if (status === 404) return { ok: false, messaggio: 'Ordine non trovato in Fornitori.' }
          if (status === 422) return { ok: false, messaggio: testoErrore(risposta, 'Ordine senza indirizzo o non geocodificabile.') }
          return { ok: false, messaggio: testoErrore(risposta, `Fornitori ha risposto ${status}.`) }
        }
      )
    },
  },
  {
    id: 'commerciale.trattativa',
    app: 'Commerciale',
    nome: 'Apri trattativa',
    descrizione: 'Apre una nuova trattativa nel CRM commerciale per il negozio.',
    colore: 'green',
    guida:
      'La mail riguarda un’opportunità commerciale con un NEGOZIO/attività. negozio = nome dell’attività (come per la proforma). linea = la linea commerciale (es. Affiliazioni, Consegne, Eventi) se citata, altrimenti null. valoreAtteso = importo previsto SOLO se scritto (numero, senza simboli), altrimenti null. fase = fase della trattativa se chiara, altrimenti null (default lato app). scadenza = data del follow-up (AAAA-MM-GG) se c’è. nextAction = la prossima azione da fare, in una frase.',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['negozio', 'linea', 'valoreAtteso', 'fase', 'scadenza', 'nextAction'],
      properties: {
        negozio: { type: 'string', description: 'Nome del negozio/attività della trattativa.' },
        linea: { type: ['string', 'null'], description: 'Linea commerciale (es. Affiliazioni).' },
        valoreAtteso: { type: ['number', 'null'], description: 'Valore previsto in euro, solo se scritto.' },
        fase: { type: ['string', 'null'], description: 'Fase della trattativa, se chiara.' },
        scadenza: { type: ['string', 'null'], description: 'Data follow-up AAAA-MM-GG.' },
        nextAction: { type: ['string', 'null'], description: 'Prossima azione da fare.' },
      },
    },
    async esegui(dati, ctx) {
      const negozio = typeof dati.negozio === 'string' ? dati.negozio.trim() : ''
      if (!negozio) return { ok: false, messaggio: 'Manca il negozio della trattativa.' }
      const body: Record<string, unknown> = {
        azione: 'apri',
        negozio,
        linea: dati.linea || undefined,
        valoreAtteso: typeof dati.valoreAtteso === 'number' ? dati.valoreAtteso : undefined,
        fase: dati.fase || undefined,
        scadenza: dati.scadenza || undefined,
        nextAction: dati.nextAction || undefined,
      }
      return chiama(
        `${COMMERCIALE_URL}/trattativa`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ctx.chiave },
          body: JSON.stringify(body),
        },
        (status, risposta) => {
          const link =
            risposta && typeof risposta === 'object'
              ? ((risposta as Record<string, unknown>).link as string) ?? ((risposta as Record<string, unknown>).url as string) ?? undefined
              : undefined
          if (status === 200 || status === 201) return { ok: true, messaggio: `Trattativa aperta per «${negozio}».`, link }
          if (status === 401 || status === 403)
            return { ok: false, messaggio: 'Chiave Commerciale non valida: controllala in Impostazioni App.' }
          if (status === 404) return { ok: false, messaggio: testoErrore(risposta, 'Negozio non trovato in Commerciale.') }
          return { ok: false, messaggio: testoErrore(risposta, `Commerciale ha risposto ${status}.`) }
        }
      )
    },
  },
]

export function tutteLeAzioni(): AzioneApp[] {
  return AZIONI
}

export function azioneDi(id: string): AzioneApp | undefined {
  return AZIONI.find((a) => a.id === id)
}

/** La versione serializzabile per i client component (senza funzioni). */
export type AzioneDescritta = {
  id: string
  app: string
  nome: string
  descrizione: string
  colore: string
  configurata: boolean
}

/** Descrive le azioni per i client component. `configurata` = la chiave della
 *  sua app è presente (inserita nell'app o via env). */
export function descriviAzioni(chiavi: ChiaviApp): AzioneDescritta[] {
  return AZIONI.map(({ id, app, nome, descrizione, colore }) => ({
    id,
    app,
    nome,
    descrizione,
    colore,
    configurata: chiaveDiAzione({ app } as AzioneApp, chiavi).length > 0,
  }))
}

/** Lo stato di collegamento di ogni app: quale chiave serve e se è a posto.
 *  Serve alla pagina Impostazioni App per guidare l'inserimento delle chiavi. */
export type StatoApp = {
  app: string
  nomeChiave: NomeChiaveApp
  colore: string
  configurata: boolean
  /** Nome della variabile d'ambiente equivalente (per chi preferisce Vercel). */
  variabileEnv: string
  /** Le funzioni che questa app offre. */
  azioni: { nome: string; descrizione: string }[]
  /** A cosa serve la chiave, in una frase. */
  comeSiOttiene: string
}

const META_APP: Record<string, { variabileEnv: string; comeSiOttiene: string }> = {
  Anagrafiche: {
    variabileEnv: 'ANAGRAFICHE_API_KEY',
    comeSiOttiene:
      'Chiave di SCRITTURA generata dall’app Anagrafiche (comando «npm run chiave -- deluxy-mail --scrittura»).',
  },
  Finance: {
    variabileEnv: 'FINANCE_API_KEY',
    comeSiOttiene: 'La chiave API di Deluxy Finance (impostazione «api.verificheKey» dell’app).',
  },
  Fornitori: {
    variabileEnv: 'FORNITORI_PASSWORD',
    comeSiOttiene:
      'La password AMMINISTRATORE dell’app Fornitori (search-deluxy) — quella che sblocca tutte le utenze, non il tuo codice utente personale. È la stessa che useresti nel comando curl «x-app-password».',
  },
  Commerciale: {
    variabileEnv: 'COMMERCIALE_API_KEY',
    comeSiOttiene:
      'La chiave x-api-key della Edge Function «trattativa» dell’app Commerciale (Supabase). Va nella cassaforte del Hub o come env COMMERCIALE_API_KEY.',
  },
}

export function statoApp(chiavi: ChiaviApp): StatoApp[] {
  // Raggruppa le azioni per app, mantenendo l'ordine del catalogo.
  const perApp = new Map<string, AzioneApp[]>()
  for (const a of AZIONI) {
    if (!perApp.has(a.app)) perApp.set(a.app, [])
    perApp.get(a.app)!.push(a)
  }

  return [...perApp.entries()].map(([app, azioni]) => {
    const nomeChiave = CHIAVE_DI_APP[app]
    return {
      app,
      nomeChiave,
      colore: azioni[0].colore,
      configurata: nomeChiave ? chiavi[nomeChiave].length > 0 : false,
      variabileEnv: META_APP[app]?.variabileEnv ?? '',
      comeSiOttiene: META_APP[app]?.comeSiOttiene ?? '',
      azioni: azioni.map((a) => ({ nome: a.nome, descrizione: a.descrizione })),
    }
  })
}

// ---------- Le regole APP DELUXY ----------

type MailPerRegole = { mittente: string; mittenteNome: string | null; oggetto: string; corpoTesto: string }

/**
 * La prima regola APP DELUXY che aggancia la mail (stessa semantica delle
 * regole della posta: tutte le condizioni valorizzate devono valere, e dentro
 * ognuna le alternative separate da virgola valgono in OR; vince la priorità
 * più alta). Una regola senza condizioni non scatta mai da sola.
 */
export function regolaAppPerMail(regole: RegolaApp[], msg: MailPerRegole): RegolaApp | null {
  const ordinate = [...regole].filter((r) => r.attiva).sort((a, b) => b.priorita - a.priorita)
  for (const r of ordinate) {
    if (!r.seMittente && !r.seOggetto && !r.seContiene) continue
    if (
      condizioneSoddisfatta(`${msg.mittenteNome ?? ''} ${msg.mittente}`, r.seMittente) &&
      condizioneSoddisfatta(msg.oggetto, r.seOggetto) &&
      condizioneSoddisfatta(msg.corpoTesto, r.seContiene)
    ) {
      return r
    }
  }
  return null
}

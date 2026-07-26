import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { leggiImpostazioni } from './impostazioni'
import { verificaIban } from './iban'

// Estrazione dei dati di pagamento da un messaggio o da un'immagine
// (schermata di una chat, foto di un bonifico).
//
// Due fornitori possibili: OpenAI (predefinito, è la chiave che l'azienda già
// usa nelle altre app) e Claude. Si sceglie da solo in base a quale chiave è
// configurata; se ci sono entrambe vince OpenAI.
//
// In ogni caso l'AI PROPONE: la verità formale sull'IBAN la stabilisce il
// checksum (src/lib/iban.ts). Se non torna, lo diciamo.

// Due modelli, per un motivo misurato: leggendo un IBAN da un'immagine,
// gpt-4o-mini ha perso due zeri (25 caratteri invece di 27) mentre gpt-4o l'ha
// letto giusto. Sulle immagini serve il modello forte; sul testo il piccolo va
// benissimo e costa una frazione.
const MODELLO_TESTO_DEFAULT = 'gpt-4o-mini'
const MODELLO_IMMAGINI_DEFAULT = 'gpt-4o'
const MODELLO_CLAUDE = 'claude-opus-5'

export type DatiPagamento = {
  iban: string
  intestatario: string
  importo: number
  valuta: string
  causale: string
}

// Output vincolato allo schema: niente JSON da ripulire a mano.
const SCHEMA = {
  type: 'object',
  properties: {
    iban: {
      type: 'string',
      description: "L'IBAN senza spazi, in maiuscolo. Stringa vuota se non compare.",
    },
    intestatario: {
      type: 'string',
      description:
        "Nome e cognome (o ragione sociale) dell'intestatario del conto. Stringa vuota se non compare.",
    },
    importo: {
      type: 'number',
      description: "L'importo da pagare in cifre, 0 se non compare. Usa il punto per i decimali.",
    },
    valuta: {
      type: 'string',
      description: "Codice valuta a 3 lettere, es. EUR. 'EUR' se non è indicata.",
    },
    causale: {
      type: 'string',
      description: 'La causale del pagamento se indicata, altrimenti stringa vuota.',
    },
  },
  required: ['iban', 'intestatario', 'importo', 'valuta', 'causale'],
  additionalProperties: false,
} as const

const ISTRUZIONI = `Estrai le coordinate di pagamento dal contenuto fornito.

Regole:
- Riporta l'IBAN esattamente come appare, senza spazi e in maiuscolo. Non correggerlo, non completarlo e non inventarne parti: se una parte è illeggibile, lascia il campo vuoto.
- L'intestatario è chi riceve il pagamento (il titolare del conto), non chi paga.
- L'importo va in cifre: "1.250,50 €" diventa 1250.50.
- Se un dato non compare, lascia il campo vuoto (0 per l'importo). Non dedurre e non tirare a indovinare.`

// ————— Risposte rapide: l'AI sceglie lo script giusto e lo adatta —————

export type Suggerimento = {
  scriptId: string
  titolo: string
  risposta: string
  motivo: string
}

const SCHEMA_RISPOSTA = {
  type: 'object',
  properties: {
    scriptId: {
      type: 'string',
      description:
        "L'id dello script scelto fra quelli forniti. Stringa vuota se nessuno è adatto.",
    },
    risposta: {
      type: 'string',
      description:
        'Il testo pronto da inviare al cliente: lo script scelto, adattato al messaggio (nome, numero ordine, data). Se nessuno script è adatto, stringa vuota.',
    },
    motivo: {
      type: 'string',
      description: 'In una riga, perché hai scelto questo script (o perché nessuno va bene).',
    },
  },
  required: ['scriptId', 'risposta', 'motivo'],
  additionalProperties: false,
} as const

const ISTRUZIONI_RISPOSTA = `Sei l'assistenza clienti di Deluxy (consegne di fiori e dolci in guanti bianchi).

Ti do il messaggio di un cliente e gli script che usiamo di solito. Scegli lo script più adatto e adattalo al messaggio.

Regole:
- Usa SOLO uno degli script forniti come base: è così che rispondiamo noi. Non inventare una risposta tua.
- Adattalo: metti il nome del cliente, il numero d'ordine, la data, se compaiono nel messaggio. Non inventare dati che non ci sono: se un dato manca, lascia la frase generica.
- Non promettere date, rimborsi o sconti che lo script non prevede.
- Rispondi in italiano, nello stesso tono dello script.
- Se nessuno script è davvero adatto, lascia scriptId e risposta vuoti e spiega perché nel motivo. Meglio nessuna risposta che una sbagliata.`

export type EsitoRisposta =
  | { stato: 'ok'; suggerimento: Suggerimento | null; fornitore: string }
  | { stato: 'non-configurato' }
  | { stato: 'errore'; messaggio: string }

/**
 * Propone la risposta a un messaggio del cliente scegliendo fra gli script.
 * Torna `suggerimento: null` quando nessuno script è adatto — è un esito
 * legittimo, non un errore: preferiamo il silenzio a una risposta inventata.
 */
export async function suggerisciRisposta(
  messaggio: string,
  script: { id: string; titolo: string; categoria: string; testo: string; quando: string }[]
): Promise<EsitoRisposta> {
  if (script.length === 0) {
    return { stato: 'errore', messaggio: 'Non c’è ancora nessuno script da cui attingere.' }
  }
  const c = await leggiImpostazioni(['openaiApiKey', 'openaiModello'])
  const chiave = pulisci(c.openaiApiKey)
  if (!chiave) return { stato: 'non-configurato' }

  const elenco = script
    .map(
      (s) =>
        `--- id: ${s.id}\ntitolo: ${s.titolo}\ncategoria: ${s.categoria}${
          s.quando ? `\nquando usarlo: ${s.quando}` : ''
        }\ntesto:\n${s.testo}`
    )
    .join('\n\n')

  const modello = (c.openaiModello || MODELLO_TESTO_DEFAULT).trim()
  try {
    const client = new OpenAI({ apiKey: chiave, timeout: 45_000, maxRetries: 2 })
    const risposta = await client.chat.completions.create({
      model: modello,
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'risposta_rapida',
          strict: true,
          schema: SCHEMA_RISPOSTA as unknown as Record<string, unknown>,
        },
      },
      messages: [
        { role: 'system', content: ISTRUZIONI_RISPOSTA },
        {
          role: 'user',
          content: `SCRIPT DISPONIBILI:\n${elenco}\n\nMESSAGGIO DEL CLIENTE:\n${messaggio}`,
        },
      ],
    })
    const testo = risposta.choices[0]?.message?.content
    if (!testo) return { stato: 'errore', messaggio: 'Risposta vuota dal modello.' }

    const d = JSON.parse(testo) as { scriptId: string; risposta: string; motivo: string }
    // Non ci fidiamo dell'id: dev'essere uno di quelli che abbiamo dato.
    const scelto = script.find((s) => s.id === d.scriptId)
    if (!scelto || !d.risposta.trim()) {
      return { stato: 'ok', suggerimento: null, fornitore: `OpenAI ${modello}` }
    }
    return {
      stato: 'ok',
      suggerimento: {
        scriptId: scelto.id,
        titolo: scelto.titolo,
        risposta: d.risposta.trim(),
        motivo: d.motivo,
      },
      fornitore: `OpenAI ${modello}`,
    }
  } catch (e) {
    return { stato: 'errore', messaggio: (e as Error).message }
  }
}

export type EsitoEstrazione =
  | { stato: 'ok'; dati: DatiPagamento; ibanValido: boolean; motivoIban: string; fornitore: string }
  | { stato: 'non-configurato' }
  | { stato: 'errore'; messaggio: string }

type Immagine = { dati: string; tipo: string }

/**
 * Ripulisce la chiave da spazi e a-capo. Una chiave incollata da un pannello
 * (o salvata su Vercel) può portarsi dietro un "\n" finale: l'intestazione
 * Authorization diventa invalida e la chiamata fallisce PRIMA di partire, con
 * un generico "Connection error" che sembra un problema di rete. Una chiave
 * valida non contiene mai spazi, quindi toglierli è sempre sicuro.
 * (Lezione presa da deluxy-mail.)
 */
function pulisci(chiave: string): string {
  return (chiave ?? '').replace(/\s+/g, '')
}

function normalizza(grezzi: Partial<DatiPagamento>, fornitore: string): EsitoEstrazione {
  const esitoIban = verificaIban(grezzi.iban ?? '')
  return {
    stato: 'ok',
    dati: {
      iban: esitoIban.normalizzato,
      intestatario: (grezzi.intestatario ?? '').trim(),
      importo: Number(grezzi.importo) || 0,
      valuta: (grezzi.valuta || 'EUR').toUpperCase(),
      causale: (grezzi.causale ?? '').trim(),
    },
    ibanValido: esitoIban.valido,
    motivoIban: esitoIban.motivo,
    fornitore,
  }
}

async function conOpenAI(
  chiave: string,
  modello: string,
  testo: string | undefined,
  immagine: Immagine | undefined
): Promise<EsitoEstrazione> {
  const client = new OpenAI({ apiKey: chiave, timeout: 45_000, maxRetries: 2 })

  const contenuto: OpenAI.Chat.Completions.ChatCompletionContentPart[] = []
  if (immagine) {
    contenuto.push({
      type: 'image_url',
      image_url: { url: `data:${immagine.tipo};base64,${immagine.dati}` },
    })
  }
  contenuto.push({ type: 'text', text: testo ? `Contenuto:\n${testo}` : 'Leggi l’immagine.' })

  const risposta = await client.chat.completions.create({
    model: modello,
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'dati_pagamento',
        strict: true,
        schema: SCHEMA as unknown as Record<string, unknown>,
      },
    },
    messages: [
      { role: 'system', content: ISTRUZIONI },
      { role: 'user', content: contenuto },
    ],
  })

  const testoRisposta = risposta.choices[0]?.message?.content
  if (!testoRisposta) return { stato: 'errore', messaggio: 'Risposta vuota dal modello.' }
  return normalizza(JSON.parse(testoRisposta) as DatiPagamento, `OpenAI ${modello}`)
}

async function conClaude(
  chiave: string,
  testo: string | undefined,
  immagine: Immagine | undefined
): Promise<EsitoEstrazione> {
  const client = new Anthropic({ apiKey: chiave })

  const contenuto: Anthropic.ContentBlockParam[] = []
  if (immagine) {
    contenuto.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: immagine.tipo as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
        data: immagine.dati,
      },
    })
  }
  contenuto.push({
    type: 'text',
    text: testo ? `${ISTRUZIONI}\n\nContenuto:\n${testo}` : ISTRUZIONI,
  })

  const risposta = await client.messages.create({
    model: MODELLO_CLAUDE,
    max_tokens: 2000,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: contenuto }],
  })

  // Le classificazioni di sicurezza possono rifiutare: va gestito prima di
  // leggere il contenuto, altrimenti si legge un array vuoto.
  if (risposta.stop_reason === 'refusal') {
    return { stato: 'errore', messaggio: 'Il modello ha rifiutato di elaborare questo contenuto.' }
  }
  const blocco = risposta.content.find((b) => b.type === 'text')
  if (!blocco || blocco.type !== 'text') {
    return { stato: 'errore', messaggio: 'Risposta vuota dal modello.' }
  }
  return normalizza(JSON.parse(blocco.text) as DatiPagamento, `Claude ${MODELLO_CLAUDE}`)
}

/**
 * Legge i dati di pagamento da un testo e/o da un'immagine.
 * `immagine` è il contenuto in base64 (senza il prefisso data:).
 */
export async function estraiPagamento(opzioni: {
  testo?: string
  immagine?: Immagine
}): Promise<EsitoEstrazione> {
  const c = await leggiImpostazioni([
    'openaiApiKey',
    'openaiModello',
    'openaiModelloImmagini',
    'anthropicApiKey',
  ])
  const chiaveOpenai = pulisci(c.openaiApiKey)
  const chiaveClaude = pulisci(c.anthropicApiKey)
  if (!chiaveOpenai && !chiaveClaude) return { stato: 'non-configurato' }

  try {
    if (chiaveOpenai) {
      // con un'immagine si usa il modello più accurato: un IBAN letto male
      // sarebbe un bonifico sbagliato
      const modello = opzioni.immagine
        ? (c.openaiModelloImmagini || MODELLO_IMMAGINI_DEFAULT).trim()
        : (c.openaiModello || MODELLO_TESTO_DEFAULT).trim()
      return await conOpenAI(chiaveOpenai, modello, opzioni.testo, opzioni.immagine)
    }
    return await conClaude(chiaveClaude, opzioni.testo, opzioni.immagine)
  } catch (e) {
    return { stato: 'errore', messaggio: (e as Error).message }
  }
}

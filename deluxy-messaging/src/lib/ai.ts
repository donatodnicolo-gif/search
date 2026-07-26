import Anthropic from '@anthropic-ai/sdk'
import { leggiImpostazione } from './impostazioni'
import { verificaIban } from './iban'

// Estrazione dei dati di pagamento da un messaggio o da un'immagine
// (schermata di una chat, foto di un bonifico) con le API di Claude.
//
// L'AI legge e propone; la verità formale la stabilisce il checksum dell'IBAN
// (src/lib/iban.ts). Se il checksum fallisce, lo diciamo invece di far passare
// coordinate sbagliate.

const MODELLO = 'claude-opus-5'

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

/** Il client Claude, o null se la chiave non è configurata. */
async function client(): Promise<Anthropic | null> {
  const chiave = await leggiImpostazione('anthropicApiKey')
  if (!chiave) return null
  return new Anthropic({ apiKey: chiave })
}

export type EsitoEstrazione =
  | { stato: 'ok'; dati: DatiPagamento; ibanValido: boolean; motivoIban: string }
  | { stato: 'non-configurato' }
  | { stato: 'errore'; messaggio: string }

/**
 * Legge i dati di pagamento da un testo e/o da un'immagine.
 * `immagine` è il contenuto in base64 (senza il prefisso data:).
 */
export async function estraiPagamento(opzioni: {
  testo?: string
  immagine?: { dati: string; tipo: string }
}): Promise<EsitoEstrazione> {
  const anthropic = await client()
  if (!anthropic) return { stato: 'non-configurato' }

  const contenuto: Anthropic.ContentBlockParam[] = []
  if (opzioni.immagine) {
    contenuto.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: opzioni.immagine.tipo as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
        data: opzioni.immagine.dati,
      },
    })
  }
  contenuto.push({
    type: 'text',
    text: opzioni.testo ? `${ISTRUZIONI}\n\nContenuto:\n${opzioni.testo}` : ISTRUZIONI,
  })

  try {
    const risposta = await anthropic.messages.create({
      model: MODELLO,
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

    const grezzi = JSON.parse(blocco.text) as DatiPagamento
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
    }
  } catch (e) {
    const err = e as Error
    return { stato: 'errore', messaggio: err.message }
  }
}

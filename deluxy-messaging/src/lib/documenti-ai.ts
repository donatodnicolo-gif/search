// I documenti da cui l'AI ricava le istruzioni: manuale del servizio clienti,
// brand voice, regole di consegna. Qui si estrae il TESTO — il file originale
// non si conserva, perché quello che serve all'AI è il testo e tenere binari nel
// Postgres condiviso con le altre app è peso che non ripaga.
//
// ⚠️ Un documento NON diventa un'istruzione da solo: si carica, l'AI propone
// delle regole, una persona sceglie quali tenere. Vedi src/lib/cs-ai.ts.

import { testoDaHtml } from './html-a-testo'

/** Il tetto del corpo di una funzione su Vercel è 4,5 MB: qui si sta sotto. */
export const LIMITE_BYTE = 4 * 1024 * 1024

/**
 * Oltre questo, il testo estratto si taglia — e lo si DICE a chi ha caricato.
 * 400.000 caratteri sono circa 200 pagine: più di così, in un documento di
 * regole, vuol dire che è stato caricato l'archivio sbagliato.
 */
export const LIMITE_CARATTERI = 400_000

export type Estrazione = {
  testo: string
  pagine: number
  /** Quello che va detto all'operatore: taglio, pagine vuote, formato zoppo. */
  avviso: string
}

export class DocumentoIllegibile extends Error {}

const ESTENSIONE = (nome: string) => (nome.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()

/** I formati che sappiamo leggere, per la scritta sotto al campo di caricamento. */
export const FORMATI = ['PDF', 'Word (.docx)', 'testo (.txt, .md)', '.csv', '.html']

/**
 * Estrae il testo da un documento caricato.
 *
 * Il tipo si decide dall'ESTENSIONE prima che dal mime: i browser mandano
 * `application/octet-stream` per il .docx più spesso di quanto si creda, e su
 * Windows un .md arriva regolarmente come `text/markdown` o come niente.
 */
export async function estraiTesto(
  nome: string,
  mime: string,
  dati: ArrayBuffer
): Promise<Estrazione> {
  const est = ESTENSIONE(nome)
  const buf = Buffer.from(dati)

  if (est === 'pdf' || mime === 'application/pdf') return await daPdf(buf)
  if (est === 'docx' || mime.includes('wordprocessingml')) return await daDocx(buf)

  // Il .doc vecchio è un formato binario diverso dal .docx e mammoth non lo
  // legge: dirlo, invece di salvare un documento pieno di caratteri di scarto.
  if (est === 'doc') {
    throw new DocumentoIllegibile(
      'Il formato .doc (Word vecchio) non si legge. Riapra il file e lo salvi come .docx o come PDF.'
    )
  }
  if (est === 'pages' || est === 'key' || est === 'numbers') {
    throw new DocumentoIllegibile(
      `I file ${est} di Apple non si leggono da qui: esporti in PDF o in Word e ricarichi.`
    )
  }

  if (est === 'html' || est === 'htm' || mime.includes('html')) {
    return sistema(daHtml(buf.toString('utf8')), 0)
  }
  if (
    ['txt', 'md', 'markdown', 'csv', 'json', 'rtf', 'text'].includes(est) ||
    mime.startsWith('text/')
  ) {
    // Un .rtf letto come testo mostra i comandi di formattazione, ma il
    // contenuto si legge lo stesso ed è meglio di un rifiuto secco.
    return sistema(buf.toString('utf8'), 0)
  }

  throw new DocumentoIllegibile(
    `Non so leggere «${nome}». Formati accettati: ${FORMATI.join(', ')}.`
  )
}

async function daPdf(buf: Buffer): Promise<Estrazione> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buf) })
  try {
    const r = await parser.getText()
    // Si uniscono le pagine a mano invece di usare `r.text`: quello ci infila
    // dei separatori «-- 1 of 12 --» che poi finirebbero nel prompt.
    const pagine = r.pages ?? []
    const testo = pagine.map((p) => p.text ?? '').join('\n\n')
    if (!testo.replace(/\s/g, '')) {
      throw new DocumentoIllegibile(
        'Questo PDF non contiene testo: è la scansione di un foglio, cioè un’immagine. ' +
          'Serve il documento originale, oppure una versione già riconosciuta (OCR).'
      )
    }
    return sistema(testo, r.total ?? pagine.length)
  } finally {
    await parser.destroy?.()
  }
}

async function daDocx(buf: Buffer): Promise<Estrazione> {
  const mammoth = (await import('mammoth')).default
  const r = await mammoth.extractRawText({ buffer: buf })
  if (!r.value.replace(/\s/g, '')) {
    throw new DocumentoIllegibile('Il documento Word risulta vuoto.')
  }
  return sistema(r.value, 0)
}

/** Via i tag, via script e style col loro contenuto (che testo non è).
 *  Sta in `html-a-testo.ts` perché serve anche alla posta in arrivo: una mail
 *  scritta solo in HTML arrivava qui senza corpo. */
const daHtml = testoDaHtml

/** Normalizza gli spazi e applica il tetto, dicendolo. */
function sistema(grezzo: string, pagine: number): Estrazione {
  const testo = grezzo
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (testo.length > LIMITE_CARATTERI) {
    return {
      testo: testo.slice(0, LIMITE_CARATTERI),
      pagine,
      avviso:
        `Il documento è lungo ${testo.length.toLocaleString('it-IT')} caratteri: ` +
        `ne sono stati tenuti i primi ${LIMITE_CARATTERI.toLocaleString('it-IT')}. ` +
        'Il resto non è stato letto.',
    }
  }
  return { testo, pagine, avviso: '' }
}

/**
 * Quanto testo del documento si manda al modello quando gli si chiede di
 * ricavare le istruzioni.
 *
 * Non è avarizia: `gpt-4o-mini` ha una finestra ampia ma la qualità cala molto
 * prima del limite, e una regola pescata a pagina 90 di un documento che il
 * modello ha letto in diagonale è una regola che nessuno ha davvero verificato.
 * Quando si taglia, si scrive nella risposta.
 */
export const LIMITE_PROMPT = 30_000

export function perIlModello(testo: string): { testo: string; tagliato: number } {
  if (testo.length <= LIMITE_PROMPT) return { testo, tagliato: 0 }
  return { testo: testo.slice(0, LIMITE_PROMPT), tagliato: testo.length - LIMITE_PROMPT }
}

/** Le prime righe, per mostrare in elenco che cosa è stato caricato davvero. */
export function assaggio(testo: string, quanti = 240): string {
  const t = testo.replace(/\s+/g, ' ').trim()
  return t.length <= quanti ? t : t.slice(0, quanti) + '…'
}

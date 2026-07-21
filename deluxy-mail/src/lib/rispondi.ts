import type { Messaggio } from '@prisma/client'
import { dataLunga } from './format'
import { plainAHtml } from './htmlMail'
import { sanitizzaHtml } from './sanitizzaHtml'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export type Modo = 'rispondi' | 'tutti' | 'inoltra'

export const TITOLI: Record<Modo, string> = {
  rispondi: 'Rispondi',
  tutti: 'Rispondi a tutti',
  inoltra: 'Inoltra',
}

export function modoValido(m: string | undefined): Modo {
  return m === 'tutti' || m === 'inoltra' ? m : 'rispondi'
}

/** "Re: " e "Fwd: " non si accumulano: "Re: Re: Re: ..." non lo vuole nessuno. */
export function prefissa(oggetto: string, prefisso: 'Re' | 'Fwd'): string {
  const pulito = oggetto.replace(/^((re|r|fwd|fw|i)\s*:\s*)+/i, '').trim()
  return `${prefisso}: ${pulito}`
}

function indirizzi(lista: string): string[] {
  return lista
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

/**
 * Il testo del messaggio originale citato sotto la risposta, com'è d'abitudine
 * nella posta: righe precedute da "> ".
 */
function cita(messaggio: Messaggio): string {
  const intestazione = `Il ${dataLunga(messaggio.data)}, ${
    messaggio.mittenteNome || messaggio.mittente
  } <${messaggio.mittente}> ha scritto:`
  const corpo = messaggio.corpoTesto
    .split('\n')
    .map((r) => `> ${r}`)
    .join('\n')
  return `\n\n${intestazione}\n${corpo}`
}

/**
 * Citazione in HTML: mantiene la FORMATTAZIONE dell'originale (grassetti, link,
 * tabelle) dentro un blockquote, invece di appiattirlo a testo con "> ".
 * L'HTML dell'originale viene ripulito (niente script) prima di inserirlo.
 */
function citaHtml(messaggio: Messaggio): string {
  const intestazione = `Il ${dataLunga(messaggio.data)}, ${
    messaggio.mittenteNome || messaggio.mittente
  } <${messaggio.mittente}> ha scritto:`
  const originale = messaggio.corpoHtml
    ? sanitizzaHtml(messaggio.corpoHtml)
    : plainAHtml(messaggio.corpoTesto)
  return `<br><div>${escapeHtml(intestazione)}</div><blockquote style="margin:0;padding-left:12px;border-left:2px solid #d0d0d0;color:#555">${originale}</blockquote>`
}

export function inoltrato(messaggio: Messaggio): string {
  return [
    '\n\n---------- Messaggio inoltrato ----------',
    `Da: ${messaggio.mittenteNome || ''} <${messaggio.mittente}>`,
    `Data: ${dataLunga(messaggio.data)}`,
    `Oggetto: ${messaggio.oggetto}`,
    `A: ${messaggio.destinatari}`,
    '',
    messaggio.corpoTesto,
  ].join('\n')
}

/**
 * Prepara i campi della finestra di scrittura a partire dal messaggio e dal
 * modo scelto.
 *
 * `mioIndirizzo` serve per "rispondi a tutti": senza toglierlo, ti risponderesti
 * da solo a ogni giro.
 */
export function preparaRisposta(opts: {
  messaggio: Messaggio
  modo: Modo
  mioIndirizzo: string
  firma?: string
}): { a: string; cc: string; oggetto: string; corpo: string } {
  const { messaggio, modo, mioIndirizzo, firma } = opts
  const io = mioIndirizzo.toLowerCase()

  // Se l'originale è HTML, la risposta si scrive in HTML e la citazione mantiene
  // la formattazione (l'editor rende l'HTML). Altrimenti resta tutto testo.
  const html = Boolean(messaggio.corpoHtml)
  // Corpo della risposta: uno spazio in cima dove scrivere, poi la firma, poi
  // l'originale citato. In HTML lo spazio è un paragrafo vuoto; in testo le
  // solite righe vuote (comportamento invariato).
  const corpoRisposta = () => {
    if (html) {
      const spazio = '<p><br></p>'
      const firmaHtml = firma ? plainAHtml(firma) : ''
      return `${spazio}${firmaHtml}${citaHtml(messaggio)}`
    }
    const coda = firma ? `\n\n${firma}` : ''
    return `${coda}${cita(messaggio)}`
  }

  if (modo === 'inoltra') {
    const coda = firma ? `\n\n${firma}` : ''
    return {
      a: '',
      cc: '',
      oggetto: prefissa(messaggio.oggetto, 'Fwd'),
      corpo: `${coda}${inoltrato(messaggio)}`,
    }
  }

  // Se il messaggio l'hai mandato tu (la casella riceve anche le proprie
  // copie), rispondere al mittente vorrebbe dire scrivere a te stesso: i
  // destinatari giusti sono quelli dell'originale.
  const mio = messaggio.mittente.toLowerCase() === io
  const altri = indirizzi(messaggio.destinatari).filter((x) => x.toLowerCase() !== io)

  if (mio) {
    return {
      a: altri.join(', '),
      cc: '',
      oggetto: prefissa(messaggio.oggetto, 'Re'),
      corpo: corpoRisposta(),
    }
  }

  const cc =
    modo === 'tutti'
      ? altri.filter((x) => x.toLowerCase() !== messaggio.mittente.toLowerCase()).join(', ')
      : ''

  return {
    a: messaggio.mittente,
    cc,
    oggetto: prefissa(messaggio.oggetto, 'Re'),
    corpo: corpoRisposta(),
  }
}

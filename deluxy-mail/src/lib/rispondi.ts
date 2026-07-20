import type { Messaggio } from '@prisma/client'
import { dataLunga } from './format'

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
function prefissa(oggetto: string, prefisso: 'Re' | 'Fwd'): string {
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

function inoltrato(messaggio: Messaggio): string {
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
  const coda = firma ? `\n\n${firma}` : ''

  if (modo === 'inoltra') {
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
      corpo: `${coda}${cita(messaggio)}`,
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
    corpo: `${coda}${cita(messaggio)}`,
  }
}

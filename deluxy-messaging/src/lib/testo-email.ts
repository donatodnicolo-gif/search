// Come si legge una mail dentro l'inbox.
//
// Le mail vere (newsletter, conferme d'ordine, notifiche dei negozi) arrivano
// in HTML: quello che salviamo è la versione testo generata da chi le manda, e
// dentro ci sono i link di tracciamento lunghi centinaia di caratteri e gli
// indirizzi delle immagini scritti fra parentesi quadre. Messi in una bolla di
// chat diventano un muro illeggibile.
//
// Qui il testo si ripulisce SOLO per mostrarlo: nel database resta quello
// originale, e in Inbox c'è il bottone per rileggerlo com'era arrivato.

/** Un pezzo di messaggio: testo normale oppure un link da rendere cliccabile. */
export type PezzoTesto =
  | { tipo: 'testo'; testo: string }
  | { tipo: 'link'; url: string; etichetta: string }

const RE_URL = /https?:\/\/[^\s<>()[\]"'`]+/gi
/** Link fra parentesi quadre: è così che l'HTML diventa testo. */
const RE_URL_PARENTESI = /\[\s*(https?:\/\/[^\]\s]+)\s*\]/gi
/** Spazio unificatore e caratteri invisibili infilati dai template. */
const RE_INVISIBILI = /[ ​-‍﻿]/g

function eImmagine(url: string): boolean {
  return /\.(gif|jpe?g|png|webp|bmp|svg|ico)(\?|#|$)/i.test(url)
}

/**
 * Toglie dal testo di una mail il rumore che non si legge: le immagini scritte
 * come indirizzo, le parentesi quadre intorno ai link, gli spazi invisibili e
 * le colonne di righe vuote.
 */
export function ripulisciTestoEmail(testo: string): string {
  return (
    testo
      .replace(/\r\n?/g, '\n')
      .replace(RE_INVISIBILI, ' ')
      // «Happiest of Days [https://…/foto.jpg]» → resta solo il nome;
      // «BUY NOW [https://…/click?…]» → il link resta, senza parentesi.
      .replace(RE_URL_PARENTESI, (_intero, url: string) => (eImmagine(url) ? '' : ` ${url} `))
      // immagini rimaste nude in mezzo al testo
      .replace(RE_URL, (url) => (eImmagine(url) ? '' : url))
      .split('\n')
      .map((riga) => riga.replace(/[ \t]+/g, ' ').trimEnd())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/** Il nome corto di un link: il sito, più il pezzo di indirizzo se è breve. */
export function etichettaLink(url: string): string {
  try {
    const u = new URL(url)
    const sito = u.hostname.replace(/^www\./, '')
    const resto = (u.pathname + u.search).replace(/\/$/, '')
    return resto.length > 1 && resto.length <= 28 ? sito + resto : sito
  } catch {
    return url.length > 40 ? `${url.slice(0, 40)}…` : url
  }
}

/**
 * Spezza il testo in parti così che i link diventino cliccabili e si vedano
 * col nome del sito invece che per intero: un link di tracciamento occupa da
 * solo dieci righe di bolla.
 */
export function pezziDiTesto(testo: string): PezzoTesto[] {
  const pezzi: PezzoTesto[] = []
  let da = 0
  for (const trovato of testo.matchAll(RE_URL)) {
    const inizio = trovato.index ?? 0
    // I link finiscono spesso con la punteggiatura della frase: non è loro.
    const url = trovato[0].replace(/[.,;:!?)]+$/, '')
    if (inizio > da) pezzi.push({ tipo: 'testo', testo: testo.slice(da, inizio) })
    pezzi.push({ tipo: 'link', url, etichetta: etichettaLink(url) })
    da = inizio + url.length
  }
  if (da < testo.length) pezzi.push({ tipo: 'testo', testo: testo.slice(da) })
  return pezzi
}

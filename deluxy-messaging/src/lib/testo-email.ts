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
/**
 * I fogli di stile che finiscono nel testo.
 *
 * ⚠️ Caso reale, notifica d'ordine Shopify: il testo comincia con
 * `.button__cell { background: #d04c66; }`, `@media print{ body { color: black
 * !important; } }` e altre venti righe di CSS prima di arrivare a «Rrenja Tafe
 * ha effettuato l'ordine #1742». Chi apre quella mail vede un muro di codice e
 * il messaggio vero sta sotto, fuori schermo.
 *
 * Si riconoscono due forme: la regola con le graffe (`selettore { … }`) e la
 * riga di sola proprietà (`padding: 0 !important;`) che resta dopo.
 */
/**
 * Una riga che «sembra CSS»: un selettore o una proprietà.
 *
 * ⚠️ Il confronto è volutamente stretto. Una riga di testo vero può finire con
 * la virgola («Gentile cliente,») e non deve sparire: perciò si accettano solo
 * le righe che COMINCIANO come un selettore — punto, cancelletto, chiocciola,
 * asterisco, o un nome di tag minuscolo con pseudo-classe — e le proprietà nella
 * forma `nome: valore;`.
 */
const RE_SELETTORE = /^\s*([.#@*][a-z0-9_-]|[a-z]+(:[a-z-]+)?\s*[,{])/i
const RE_PROPRIETA = /^\s*[a-z-]{2,30}\s*:\s*[^;\n{}]{1,120};?\s*$/i
/** Dentro le graffe c'è una proprietà CSS? Distingue una regola da una frase. */
const RE_PROPRIETA_DENTRO = /[{][^{}]*[a-z-]{2,30}\s*:\s*[^;{}]+[;}]/i

/**
 * Il testo senza i fogli di stile.
 *
 * Non è una regex sola perché il CSS nelle mail è su più righe: un elenco di
 * selettori, la graffa aperta, le proprietà, la graffa chiusa. Si conta la
 * profondità delle graffe e si buttano le righe che stanno dentro.
 */
function senzaCss(testo: string): string {
  const fuori: string[] = []
  let dentro = 0
  for (const riga of testo.split('\n')) {
    const aperte = (riga.match(/\{/g) ?? []).length
    const chiuse = (riga.match(/\}/g) ?? []).length
    if (dentro > 0) {
      dentro = Math.max(0, dentro + aperte - chiuse)
      continue // riga interna a una regola: via
    }
    if (RE_SELETTORE.test(riga) || (aperte > 0 && chiuse === 0 && riga.trim().endsWith('{'))) {
      dentro = Math.max(0, aperte - chiuse)
      continue
    }
    if (aperte > 0 && aperte === chiuse && /[{][^{}]*[}]/.test(riga) && RE_PROPRIETA_DENTRO.test(riga)) {
      continue // regola tutta su una riga: `sel { colore: rosso; }`
    }
    if (RE_PROPRIETA.test(riga)) continue
    if (/^\s*[{}]\s*$/.test(riga)) continue
    fuori.push(riga)
  }
  return fuori.join('\n')
}

export function ripulisciTestoEmail(testo: string): string {
  // Il CSS va via PRIMA di tutto: dopo, spezzato dalle altre pulizie, diventa
  // irriconoscibile e resta lì in mezzo al messaggio.
  const senzaStili = senzaCss(testo.replace(/\r\n?/g, '\n').replace(RE_INVISIBILI, ' '))
  return (
    senzaStili
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

// Ripulisce l'HTML di una mail prima di mostrarlo. È la PRIMA difesa; la
// seconda è l'iframe in sandbox senza script (vedi CorpoMessaggio), che
// impedisce comunque l'esecuzione di codice anche se qualcosa sfuggisse qui.
//
// Togliamo: script, iframe/object/embed (contenuti attivi), link/meta
// (risorse esterne e refresh), gli handler on... e gli URL javascript:.
// Teniamo: tag, stili inline, <style> (isolati nell'iframe), immagini, tabelle
// — cioè tutto ciò che serve a far apparire la mail come l'ha pensata chi l'ha
// scritta.

/**
 * Vero solo per un `src="data:image/<raster>;base64,…"`: l'unica forma di
 * `data:` che si lascia passare.
 * ⚠️ Solo `src` (mai `href`/`action`: lì un data: è una navigazione), solo
 * formati **raster**, e solo `;base64,` — la forma canonica. `image/svg+xml`
 * resta fuori: un SVG è un documento e può portare script.
 */
function immagineInLineaSicura(attr: string, schema: string, resto: string): boolean {
  if (schema.toLowerCase() !== 'data' || attr.toLowerCase() !== 'src') return false
  return /^\s*image\/(png|jpe?g|gif|webp|bmp|avif|x-icon)\s*;\s*base64\s*,/i.test(resto)
}

/**
 * Un indirizzo web scritto NUDO nel testo, senza il tag che lo rende un link.
 *
 * ⚠️ Si ferma prima della punteggiatura finale: in «vai su https://x.it/a.»
 * il punto è della frase, non dell'indirizzo, e includendolo il link porta a
 * una pagina che non esiste. Stessa cosa per la parentesi chiusa in
 * «(vedi https://x.it/a)».
 */
const URL_NUDO = /https?:\/\/[^\s<>"']+/gi
/** La coda che non fa parte dell'indirizzo. */
const CODA = /[.,;:!?)\]}'"]+$/

/**
 * Rende cliccabili gli indirizzi scritti NUDI dentro una mail HTML.
 *
 * ⚠️ PERCHÉ SERVE. Molti mittenti (Typeform, i sistemi di notifica, chiunque
 * generi la mail da un modello di testo) mettono l'indirizzo nel corpo senza
 * avvolgerlo in un `<a>`: nel loro HTML è testo. I client di posta lo
 * riconoscono e lo rendono cliccabile; qui restava testo morto, e per aprirlo
 * bisognava selezionarlo e copiarlo a mano — mentre due righe più sotto i
 * «qui» scritti come veri link funzionavano (segnalato il 27/08/2026).
 *
 * ⚠️⚠️ SI CAMMINA SUI PEZZI, non si fa una sostituzione globale sull'HTML.
 * Un `replace` su tutto il documento entrerebbe DENTRO gli attributi
 * (`href="https://…"` diventerebbe un link dentro un link) e dentro i blocchi
 * `<style>`. Qui l'HTML si spezza in tag e testo, e si tocca solo il testo —
 * e nemmeno quello, se siamo dentro un `<a>` che il mittente ha già messo.
 */
export function collegaUrlNudi(html: string): string {
  if (!html) return html
  const pezzi = html.split(/(<[^>]*>)/)
  let dentroLink = 0
  let dentroCodice = 0
  return pezzi
    .map((p) => {
      if (p.startsWith('<')) {
        const t = p.toLowerCase()
        if (/^<a\b/.test(t)) dentroLink++
        else if (/^<\/a\b/.test(t)) dentroLink = Math.max(0, dentroLink - 1)
        // `style`/`script`/`textarea`: dentro non c'è testo da leggere, c'è
        // codice. `script` il sanificatore l'ha già tolto, ma questa funzione
        // dev'essere sicura anche da sola.
        else if (/^<(style|script|textarea)\b/.test(t)) dentroCodice++
        else if (/^<\/(style|script|textarea)\b/.test(t)) dentroCodice = Math.max(0, dentroCodice - 1)
        return p
      }
      if (!p || dentroLink > 0 || dentroCodice > 0) return p
      return p.replace(URL_NUDO, (grezzo) => {
        const coda = grezzo.match(CODA)?.[0] ?? ''
        const indirizzo = coda ? grezzo.slice(0, grezzo.length - coda.length) : grezzo
        if (!indirizzo) return grezzo
        // ⚠️ `target="_blank"` con `rel="noopener noreferrer"`: la pagina che
        // si apre non deve poter toccare quella da cui è partita, e non deve
        // sapere da dove arriva. Una mail è testo di uno sconosciuto.
        return `<a href="${indirizzo}" target="_blank" rel="noopener noreferrer">${indirizzo}</a>${coda}`
      })
    })
    .join('')
}

export function sanitizzaHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    // svg/math portano vettori a sé, <base> dirotta i link relativi: via del
    // tutto, non servono a mostrare una mail. Anche i tag NON chiusi (un
    // `<svg/onload=…>` senza `</svg>`), o resterebbero mezzi in piedi.
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<math[\s\S]*?<\/math>/gi, '')
    .replace(/<\/?(svg|math)\b[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    // Attributi on... (onclick, onload, onerror…), in TUTTE le forme.
    // ⚠️ Il separatore prima di «on» NON è solo uno spazio: un client può
    // scrivere `<img src=x /onerror="…">`, dove prima di onerror c'è una «/».
    // Il browser lo interpreta lo stesso come attributo (unexpected-solidus),
    // quindi va tolto anche quel caso — se no il gestore sopravvive e, appena
    // l'HTML finisce in innerHTML dell'editor di risposta, esegue (trovato in
    // revisione il 14/08/2026). Si cattura il separatore e lo si rimette, così
    // `x/onerror=…` non collassa in `xonerror=…`.
    .replace(/([\s"'`/])on\w+\s*=\s*"[^"]*"/gi, '$1')
    .replace(/([\s"'`/])on\w+\s*=\s*'[^']*'/gi, '$1')
    .replace(/([\s"'`/])on\w+\s*=\s*[^\s>]+/gi, '$1')
    // Immagini che NON potranno mai caricarsi: `cid:` (parte MIME interna alla
    // mail) e `x-msg://` (riferimento interno di Apple Mail). Il browser ci
    // disegnerebbe l'icona di immagine rotta col nome del file come didascalia
    // — segnalato il 17/08/2026: «perché si vede così?», con quattro icone
    // rotte in fila. Si toglie il tag: le immagini vere stanno fra gli allegati.
    .replace(/<img\b[^>]*\bsrc\s*=\s*["']?\s*(?:cid:|x-msg:)[^>]*>/gi, '')
    // href/src/action che aprirebbero javascript: o data:text/html (esegue).
    // ⚠️ Le immagini in linea `data:image/...;base64` vanno TENUTE: sono il modo
    // normale in cui i client incorporano firme e screenshot, non possono
    // eseguire niente, e togliendole si vedono quattro icone rotte al posto
    // della mail (è quello che era succeso con la correzione XSS del 14/08).
    // ⚠️ `image/svg+xml` NO: un SVG può contenere script — resta bloccato.
    .replace(
      /(href|src|action|formaction|xlink:href)\s*=\s*"\s*(javascript|data):([^"]*)"/gi,
      (tutto, attr: string, schema: string, resto: string) =>
        immagineInLineaSicura(attr, schema, resto) ? tutto : `${attr}="#"`
    )
    .replace(
      /(href|src|action|formaction|xlink:href)\s*=\s*'\s*(javascript|data):([^']*)'/gi,
      (tutto, attr: string, schema: string, resto: string) =>
        immagineInLineaSicura(attr, schema, resto) ? tutto : `${attr}='#'`
    )
    // @import remoti dentro i blocchi <style>
    .replace(/@import[^;]+;/gi, '')
}

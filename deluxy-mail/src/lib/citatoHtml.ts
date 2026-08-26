/**
 * IL TESTO CITATO — VERSIONE HTML.
 *
 * `dividiCitato` (in `citato.ts`) ripiega la conversazione riportata, ma solo
 * nella vista TESTO. La vista predefinita però è quella FORMATTATA (l'iframe),
 * e lì il decimo messaggio arrivava con tutti e nove i precedenti srotolati
 * sotto: la parte nuova erano quattro righe, lo storico una schermata e mezza
 * (segnalato il 26/08/2026 su «Richiesta catering 3/09»).
 *
 * Qui si lavora DIRETTAMENTE sul DOM dentro l'iframe, dopo il caricamento:
 * si trova dove comincia la citazione, si nasconde da lì in giù e si mette un
 * tasto per riaprirla. È la pagina a farlo (la sandbox ha `allow-same-origin`
 * e NIENTE `allow-scripts`): dentro la mail non gira mai codice, come per i
 * tasti rapidi e i clic sui link già gestiti in `CorpoMessaggio`.
 *
 * ⚠️ Stessa filosofia di `dividiCitato`: nel dubbio si mostra tutto. Un taglio
 * sbagliato nasconde parte del messaggio VERO, che è peggio del disturbo che
 * si voleva togliere. Quindi: se la parte nuova resta troppo corta (inoltro
 * puro) o la citazione è breve, non si tocca niente.
 */

/** Contenitori di citazione che i client dichiarano da soli. */
const CONTENITORI =
  'blockquote[type="cite"], .gmail_quote, #divRplyFwdMsg, .yahoo_quoted, .moz-cite-prefix, .protonmail_quote'

/** Le righe che aprono una citazione (gemelle dei SEGNI di `citato.ts`). */
const MARCATORI: RegExp[] = [
  // «Il giorno 26 ago 2026, alle ore 10:15, X ha scritto:» e la variante
  // «Il 26/08/2026 10:15 CEST X <x@y.it> ha scritto:»
  /^il\s+.{0,200}?ha\s+scritto\s*:?\s*$/is,
  /^on\s+.{0,200}?wrote\s*:?\s*$/is,
  /^-{2,}\s*(messaggio originale|original message|messaggio inoltrato|forwarded message)/i,
  /^(da|from)\s*:\s*.{2,200}$/is,
]

const MINIMO_CITATO = 200
const MINIMO_NUOVO = 2

/** Il testo dei soli figli di testo diretti (non dei discendenti). */
function testoProprio(el: Element): string {
  let t = ''
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) t += n.textContent ?? ''
  })
  return t.trim()
}

/** true se questo elemento È l'inizio della citazione. */
function eInizioCitato(el: Element): boolean {
  if (el.matches(CONTENITORI)) return true
  // La riga-marcatore: o l'elemento è corto e coincide con essa, o la contiene
  // come proprio testo diretto (Apple Mail: <div>Il giorno … ha scritto:<br><blockquote>…).
  const tutto = (el.textContent ?? '').trim()
  const proprio = testoProprio(el)
  const candidati = [proprio, tutto.length <= 300 ? tutto : ''].filter(Boolean)
  return candidati.some((t) => t.length <= 300 && MARCATORI.some((r) => r.test(t)))
}

/**
 * Ripiega la citazione dentro il documento dell'iframe. Idempotente: al
 * secondo giro sullo stesso documento non fa niente.
 * `alCambio` viene chiamato a ogni apertura/chiusura (serve a rimisurare
 * l'altezza dell'iframe dalla pagina).
 */
export function ripiegaCitatoHtml(doc: Document, alCambio: () => void): void {
  const body = doc.body
  if (!body || body.dataset.citatoPronto) return
  body.dataset.citatoPronto = '1'

  // Il PRIMO inizio-citazione in ordine di documento.
  let marcatore: Element | null = null
  for (const el of Array.from(body.querySelectorAll('*'))) {
    if (eInizioCitato(el)) {
      marcatore = el
      break
    }
  }
  if (!marcatore) return

  // Da nascondere: il marcatore, tutto ciò che lo segue al suo livello, e i
  // fratelli successivi di ogni suo antenato fino al body — cioè tutto quello
  // che viene DOPO in ordine di documento, senza toccare ciò che sta prima.
  const daNascondere: Element[] = [marcatore]
  for (let s = marcatore.nextElementSibling; s; s = s.nextElementSibling) daNascondere.push(s)
  for (let p = marcatore.parentElement; p && p !== body; p = p.parentElement) {
    for (let s = p.nextElementSibling; s; s = s.nextElementSibling) daNascondere.push(s)
  }

  const citato = daNascondere.map((el) => el.textContent ?? '').join(' ')
  if (citato.trim().length < MINIMO_CITATO) return

  // Lo stile che governa il ripiego + la riga di stacco quando è aperto.
  const stile = doc.createElement('style')
  stile.textContent = `
    body:not([data-citato-aperto]) [data-aimail-citato]{display:none !important}
    [data-aimail-citato-marcatore]{border-top:1px solid #d2d2d7;margin-top:14px;padding-top:12px;color:#6e6e73}
  `
  doc.head.appendChild(stile)
  daNascondere.forEach((el) => el.setAttribute('data-aimail-citato', ''))
  marcatore.setAttribute('data-aimail-citato-marcatore', '')

  // ⚠️ La guardia sulla parte NUOVA si misura a citazione nascosta:
  // `innerText` rispetta il display, `textContent` no. Se resta troppo poco è
  // un inoltro puro, e si disfa tutto.
  const nuovo = (body.innerText ?? '').trim()
  if (nuovo.split(/\s+/).filter(Boolean).length < MINIMO_NUOVO) {
    daNascondere.forEach((el) => el.removeAttribute('data-aimail-citato'))
    marcatore.removeAttribute('data-aimail-citato-marcatore')
    stile.remove()
    return
  }

  // Il tasto, nello stesso vestito del `.citato-tasto` della vista testo.
  const tasto = doc.createElement('button')
  tasto.type = 'button'
  tasto.setAttribute('data-aimail-citato-tasto', '')
  tasto.style.cssText =
    'display:inline-block;margin-top:10px;padding:2px 10px;border:1px solid #d2d2d7;' +
    'border-radius:999px;background:#f5f5f7;color:#6e6e73;font:12px -apple-system,' +
    "BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;cursor:pointer"
  const aggiornaTasto = () => {
    const aperto = body.hasAttribute('data-citato-aperto')
    tasto.textContent = aperto ? '− nascondi i messaggi precedenti' : '··· mostra i messaggi precedenti'
    tasto.title = aperto
      ? 'Nascondi la conversazione riportata sotto'
      : 'Mostra la conversazione riportata sotto'
  }
  aggiornaTasto()
  // Il tasto sta al livello del body, subito prima del ramo che contiene la
  // citazione: così resta visibile fra la parte nuova e quella ripiegata.
  let ramo: Element = marcatore
  while (ramo.parentElement && ramo.parentElement !== body) ramo = ramo.parentElement
  body.insertBefore(tasto, ramo)

  // Il clic lo ascolta la PAGINA (nessuno script dentro la mail).
  tasto.addEventListener('click', () => {
    if (body.hasAttribute('data-citato-aperto')) body.removeAttribute('data-citato-aperto')
    else body.setAttribute('data-citato-aperto', '')
    aggiornaTasto()
    alCambio()
  })

  // L'altezza dell'iframe era stata misurata sulla mail INTERA: ripiegata la
  // citazione va rimisurata, o resta una fascia vuota alta quanto lo storico.
  alCambio()
}

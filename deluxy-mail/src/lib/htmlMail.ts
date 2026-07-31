// Aiuti per il corpo delle mail in HTML (editor formattato) e la sua versione
// testo semplice (per il multipart text/plain e per la traduzione).

// I tag che l'editor produce davvero. Cercare QUESTI (e non un generico
// "<parola>") evita di scambiare un testo semplice come "prezzo <soglia>" per
// HTML e rovinarlo togliendogli i pezzi tra parentesi angolari.
const TAG_HTML = /<\/?(br|div|p|span|strong|b|em|i|u|ul|ol|li|a|h[1-6]|blockquote|table|tr|td)(\s[^>]*)?\/?>/i

/** Vero se la stringa contiene markup HTML dei tag che usiamo nelle mail. */
export function sembraHtml(s: string): boolean {
  return TAG_HTML.test(s)
}

/** Testo semplice → HTML sicuro: escape + a-capo come <br>. */
export function plainAHtml(testo: string): string {
  const esc = testo
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return esc.replace(/\r?\n/g, '<br>')
}

/**
 * Il «testo» di una mail HTML è SPORCO di indirizzi?
 *
 * Caso reale (30 lug): un client di posta aveva avvolto singole LETTERE in un
 * link — `Buongio<a href="mailto:x@y.it">r</a>no Luca` — e la conversione in
 * testo semplice ci ha infilato dentro l'indirizzo: «Buongior
 * mailto:x@y.itno Luca». Non è un caso di scuola: quel testo è anche quello
 * che legge l'AI.
 */
export function testoSporcoDiLink(testo: string): boolean {
  const mailto = (testo.match(/mailto:/gi) ?? []).length
  if (mailto >= 3) return true
  // Lo stesso indirizzo http ripetuto dentro il testo: stessa malattia.
  const url = testo.match(/https?:\/\/\S{6,}/gi) ?? []
  if (url.length >= 4 && new Set(url.map((u) => u.slice(0, 40))).size <= 2) return true
  return false
}

/**
 * Il testo MIGLIORE fra quello che arriva dal server e quello ricavato
 * dall'HTML. Si preferisce quello del server (di norma è il text/plain scritto
 * davvero), tranne quando è sporco di indirizzi: lì l'HTML, ripulito dai tag,
 * dice quello che c'è scritto — «Buongiorno Luca», non «Buongior mailto:…no».
 */
export function testoMigliore(testo: string, html: string | null | undefined): string {
  if (!html || !testoSporcoDiLink(testo)) return testo
  const daHtml = htmlAPlain(html)
  // Se dall'HTML non esce niente di sensato si tiene quello che c'era: meglio
  // sporco che vuoto.
  return daHtml.replace(/\s+/g, ' ').trim().length >= 20 ? daHtml : testo
}

/** HTML → testo semplice leggibile (per text/plain e per tradurre). */
export function htmlAPlain(html: string): string {
  return (
    html
      // ⚠️ PRIMA i blocchi con dentro roba che non è testo: togliendo solo i
      // tag, il CONTENUTO di <style> resta — ed è così che in cima a una mail
      // compariva «P {margin-top:0;margin-bottom:0;}».
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
      .replace(/<\s*li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      // Le righe fatte di soli spazi vengono dai <div> vuoti dell'HTML: non
      // sono righe bianche volute, e senza toglierle il testo esce a scaletta.
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

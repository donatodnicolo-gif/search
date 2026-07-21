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

/** HTML → testo semplice leggibile (per text/plain e per tradurre). */
export function htmlAPlain(html: string): string {
  return html
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
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

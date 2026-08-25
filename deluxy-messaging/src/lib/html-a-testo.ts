/**
 * HTML → testo leggibile.
 *
 * Serve in due punti lontani fra loro ma con lo stesso bisogno: gli allegati
 * (`documenti-ai.ts`, un .html caricato da un fornitore) e la posta in arrivo
 * (`email.ts`, una mail scritta SOLO in HTML). In entrambi i casi quello che
 * conta è il testo: i tag sono impaginazione, e chi legge — persona o AI — non
 * ci fa niente.
 *
 * ⚠️ Non è un sanificatore anti-XSS: qui i tag si buttano via, non si mettono in
 * sicurezza per rimetterli a schermo. Se un giorno serve MOSTRARE l'HTML di una
 * mail, questa non è la funzione giusta.
 */
export function testoDaHtml(html: string): string {
  return html
    // script e style col loro contenuto: sono codice, non testo, e lasciarli
    // dentro riempirebbe il corpo di regole CSS.
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    // Gli a capo dell'impaginato vanno tenuti, o esce un muro di parole.
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** Spazi normalizzati: niente righe vuote a raffica, niente doppi spazi. */
export function normalizzaSpazi(grezzo: string): string {
  return grezzo
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

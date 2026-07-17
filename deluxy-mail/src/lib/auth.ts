// Protezione con password unica, come deluxy-partner.
// Il cookie di sessione è l'HMAC della password: cambiando APP_PASSWORD si
// invalidano tutte le sessioni aperte.

export const SESSION_COOKIE = 'aimail_session'

export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`deluxy-mail::${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Vero solo quando l'app gira sulla macchina di chi la usa.
 *
 * Qui dentro c'è una casella di posta intera: senza password, chiunque abbia
 * l'URL legge tutto e può scrivere a tuo nome. In locale la password si può
 * saltare; appena l'app è raggiungibile dalla rete, no. Per questo il
 * controllo non guarda solo se APP_PASSWORD c'è: guarda anche dove gira.
 */
export function ambienteLocale(): boolean {
  return process.env.NODE_ENV !== 'production' && !process.env.VERCEL
}

/** Cookie (leggibile) con l'email di chi è entrato: serve solo a riproporla
 *  al prossimo accesso, non è un fattore di sicurezza. */
export const EMAIL_COOKIE = 'aimail_email'

/**
 * Vero se l'email può entrare.
 *
 * `APP_EMAIL` è l'elenco delle email autorizzate, separate da virgola. Se non
 * è impostata, l'email è comunque obbligatoria da digitare ma non viene
 * confrontata con un elenco — così il campo esiste da subito senza costringere
 * a configurare nulla, e diventa un vero filtro appena metti APP_EMAIL.
 */
export function emailAmmessa(email: string): boolean {
  const consentite = (process.env.APP_EMAIL ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (consentite.length === 0) return email.trim().length > 0
  return consentite.includes(email.trim().toLowerCase())
}

// Protezione con password di team.
// Due profili di accesso:
//   - PARTNER_APP_PASSWORD          → accesso pieno (può modificare)
//   - PARTNER_APP_PASSWORD_READONLY → sola lettura (non modifica nulla)
// Se PARTNER_APP_PASSWORD non è impostata (sviluppo locale) l'app è aperta.
// Il cookie di sessione è l'HMAC della password usata per entrare: dal cookie si
// ricava il ruolo. Cambiando una password su Vercel si invalidano le relative sessioni.

export const SESSION_COOKIE = "dp_session";

export type Ruolo = "admin" | "sola_lettura";

export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`deluxy-partner::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Ricava il ruolo dal valore del cookie di sessione (o null se non valido).
export async function ruoloDaSessione(cookieValue: string | undefined): Promise<Ruolo | null> {
  if (!cookieValue) return null;
  const admin = process.env.PARTNER_APP_PASSWORD;
  const readonly = process.env.PARTNER_APP_PASSWORD_READONLY;
  if (admin && cookieValue === (await sessionToken(admin))) return "admin";
  if (readonly && cookieValue === (await sessionToken(readonly))) return "sola_lettura";
  return null;
}

// Protezione con password unica (team interno).
// Se PARTNER_APP_PASSWORD non è impostata (sviluppo locale) l'app è aperta.
// Il cookie di sessione è l'HMAC della password: cambiando la password
// su Vercel si invalidano tutte le sessioni.

export const SESSION_COOKIE = "dp_session";

export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`deluxy-partner::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

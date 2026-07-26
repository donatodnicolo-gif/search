// Protezione della UI con password unica (team interno), come deluxy-orders,
// deluxy-partner e deluxy-anagrafiche. Se BUDGETS_APP_PASSWORD non è impostata
// (sviluppo locale) la UI è aperta.
// Il cookie di sessione è l'HMAC della password: cambiando la password in
// produzione si invalidano tutte le sessioni.

export const SESSION_COOKIE = "bdg_session";

export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`deluxy-budgets::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

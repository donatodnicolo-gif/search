// Protezione della UI con password unica (team interno), come deluxy-orders,
// deluxy-partner e deluxy-anagrafiche. Se BUDGETS_APP_PASSWORD non è impostata
// (sviluppo locale) la UI è aperta.
// Il cookie di sessione è l'HMAC della password: cambiando la password in
// produzione si invalidano tutte le sessioni.

export const SESSION_COOKIE = "bdg_session";

// Il token porta dentro anche un **segreto del server** (`APP_SECRET`), non
// solo la password. Senza, il cookie sarebbe una funzione della sola password:
// chi la conosce potrebbe calcolarselo da sé e infilarlo nel browser,
// **saltando il codice di autenticazione**. Con il segreto dentro, un cookie
// valido lo può produrre solo il server — e solo dopo aver visto il codice.
//
// Cambiando `APP_SECRET` (o la password) tutte le sessioni decadono: è il modo
// per far rientrare tutti quando serve.
export async function sessionToken(password: string): Promise<string> {
  const segretoServer = process.env.APP_SECRET ?? "";
  const data = new TextEncoder().encode(`deluxy-budgets::${password}::${segretoServer}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

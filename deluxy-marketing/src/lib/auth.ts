// Protezione della UI con password unica (team interno), come deluxy-partner
// e deluxy-anagrafiche. Se MARKETING_APP_PASSWORD non è impostata (sviluppo
// locale) la UI resta aperta: la password serve solo in produzione.
//
// Le API /api/v1 NON passano da qui: sono protette dalle chiavi API, perché le
// chiamano gli script di Google Ads e le sessioni Claude, non un browser.
//
// Il cookie di sessione è lo SHA-256 della password: cambiando la password in
// produzione si invalidano tutte le sessioni aperte.

export const SESSION_COOKIE = "dmk_session";

export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`deluxy-marketing::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Protezione della UI con password unica (team interno), come deluxy-partner e
// deluxy-anagrafiche. Se ORDERS_APP_PASSWORD non è impostata (sviluppo locale)
// la UI è aperta. Le API /api/v1 NON passano da qui: le protegge la chiave API.
//
// Il cookie di sessione è un HMAC-SHA256 firmato con un SEGRETO SERVER
// (`APP_SECRET`, convenzione Standard Deluxy §4.4). Perché HMAC e non un
// semplice SHA-256 della password: senza segreto server il token era uno
// SHA-256 non chiavato su un prefisso noto + la password, quindi un cookie
// trapelato consentiva il **brute-force OFFLINE della password di team** (e
// quella password è riusata su altre app: movimento laterale). Con la firma
// keyed, senza `APP_SECRET` quei tentativi non si possono nemmeno verificare.
// Cambiando la password — o il segreto — in produzione si invalidano tutte le
// sessioni (tutti rifanno login una volta).
//
// Gira sia in Node (server action del login) sia in Edge (middleware): per
// questo usa Web Crypto (`crypto.subtle`), disponibile in entrambi.

export const SESSION_COOKIE = "ord_session";

function esa(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return esa(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

async function sha256(message: string): Promise<string> {
  return esa(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message)));
}

export async function sessionToken(password: string): Promise<string> {
  const secret = (process.env.APP_SECRET ?? "").trim();
  const message = `deluxy-orders::${password}`;
  // In produzione `APP_SECRET` c'è sempre (su Vercel) → HMAC con segreto
  // server. Senza (solo sviluppo locale) si ripiega sullo SHA-256 di prima:
  // niente si rompe in locale, e non è meno sicuro di com'era.
  return secret ? hmacSha256(secret, message) : sha256(message);
}

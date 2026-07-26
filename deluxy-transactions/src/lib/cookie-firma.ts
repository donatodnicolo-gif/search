// Firma del cookie di sessione con WebCrypto: questo file NON importa nulla di
// Node, perché lo usa anche il middleware, che gira sul runtime Edge.
//
// Il cookie vale `<id sessione>.<hmac>`: il middleware può scartare subito i
// cookie falsi senza toccare il database, e il controllo vero (sessione ancora
// viva, non revocata, operatore attivo) lo fa il server component.

function segreto(): string {
  const s = (process.env.APP_SECRET ?? "").trim();
  // In sviluppo senza APP_SECRET si usa un valore fisso, così l'app parte; in
  // produzione il middleware rifiuta tutto se manca (vedi middleware.ts).
  return s || "deluxy-transactions-sviluppo";
}

async function hmac(messaggio: string): Promise<string> {
  const chiave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segreto()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", chiave, new TextEncoder().encode(messaggio));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const COOKIE_SESSIONE = "trx_sessione";

export async function componiCookie(idSessione: string): Promise<string> {
  return `${idSessione}.${await hmac(idSessione)}`;
}

/** Ritorna l'id di sessione se la firma è buona, altrimenti null. */
export async function idDaCookie(valore: string | undefined): Promise<string | null> {
  if (!valore) return null;
  const taglio = valore.lastIndexOf(".");
  if (taglio <= 0) return null;
  const id = valore.slice(0, taglio);
  const firma = valore.slice(taglio + 1);
  const attesa = await hmac(id);
  if (attesa.length !== firma.length) return null;
  // Confronto a tempo costante anche qui: l'Edge non ha timingSafeEqual.
  let diff = 0;
  for (let i = 0; i < attesa.length; i++) diff |= attesa.charCodeAt(i) ^ firma.charCodeAt(i);
  return diff === 0 ? id : null;
}

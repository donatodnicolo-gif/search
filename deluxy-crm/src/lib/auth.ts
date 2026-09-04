import { isRuolo, type Ruolo } from "./ruoli";

// Sessione firmata (HMAC-SHA256) dentro un cookie, come nelle altre app Deluxy:
// il middleware la valida sull'Edge senza interrogare il database. Usa solo Web
// Crypto, quindi funziona sia nel middleware sia nelle server action.
//
// L'accesso all'app è la password di team (CRM_APP_PASSWORD, pattern di
// Orders/Scripts) oppure il Single Sign-On dal Deluxy Hub (/api/sso): in quel
// caso la sessione porta nome e ruolo della persona. Il CRM non tiene utenti
// propri: gli utenti vivono nel Hub.

export const SESSION_COOKIE = "dcrm_session";
export const DURATA_SESSIONE_S = 60 * 60 * 24 * 30; // 30 giorni

export type Sessione = {
  nome: string;
  email?: string;
  ruolo: Ruolo;
  via: "sso" | "password";
  gen?: number; // versione della password con cui è nata (revoca: sessione-server.ts)
  exp: number; // secondi epoch
};

// In produzione l'app non si apre senza le sue porte: password e segreto di
// sessione. Fail-closed (pattern di deluxy-merchandising): meglio un 503 chiaro
// che i dati dei clienti pubblici in rete.
export function inProduzione(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

export function configAuthCompleta(): boolean {
  return Boolean(process.env.CRM_APP_PASSWORD) && Boolean(process.env.CRM_SESSION_SECRET);
}

// Auth attiva = c'è un segreto con cui firmare. Se manca (solo sviluppo
// locale), la UI è aperta e si lavora come admin.
export function authAttiva(): boolean {
  return Boolean(process.env.CRM_SESSION_SECRET);
}

function segreto(): string {
  const s = process.env.CRM_SESSION_SECRET;
  if (!s) throw new Error("CRM_SESSION_SECRET non impostata: la sessione non può essere firmata.");
  return s;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(testo: string): Uint8Array {
  const b64 = testo.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function firma(payload: string): Promise<string> {
  const chiave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segreto()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", chiave, new TextEncoder().encode(payload));
  return b64urlEncode(new Uint8Array(sig));
}

export async function creaSessione(dati: Omit<Sessione, "exp">): Promise<string> {
  const sessione: Sessione = { ...dati, exp: Math.floor(Date.now() / 1000) + DURATA_SESSIONE_S };
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify(sessione)));
  return `${payload}.${await firma(payload)}`;
}

export async function leggiSessione(token: string | undefined): Promise<Sessione | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  // Confronto a tempo costante sulla firma.
  const attesa = await firma(payload);
  if (attesa.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < attesa.length; i++) diff |= attesa.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;

  try {
    const dati = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as Sessione;
    if (typeof dati.exp !== "number" || dati.exp < Date.now() / 1000) return null;
    if (typeof dati.nome !== "string" || !isRuolo(dati.ruolo)) return null;
    return dati;
  } catch {
    return null;
  }
}

// Confronto a tempo costante fra la password digitata e quella di NASCITA
// (CRM_APP_PASSWORD). Vale solo finché nessuno l'ha cambiata dall'app: da
// allora decide il database (password-team.ts, che chiama questa come ripiego).
export async function verificaPasswordTeam(digitata: string): Promise<boolean> {
  const attesa = process.env.CRM_APP_PASSWORD;
  if (!attesa || !digitata) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(digitata)),
    crypto.subtle.digest("SHA-256", enc.encode(attesa)),
  ]);
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

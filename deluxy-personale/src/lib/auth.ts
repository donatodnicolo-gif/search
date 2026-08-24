import { isRuolo, type Ruolo } from "./ruoli";

// Sessione firmata (HMAC-SHA256) dentro un cookie, come nel Deluxy Hub: il
// middleware la valida sull'Edge senza interrogare il database. Solo Web Crypto,
// quindi funziona sia nel middleware sia nelle server action.
//
// L'accesso è con la PASSWORD DELL'APP (PERSONALE_APP_PASSWORD, come le altre
// app Deluxy) oppure via SSO dal Hub (/api/sso). Gli utenti NON vivono qui:
// vivono nel Hub (Standard §7.2) e questa app non ne tiene copia né li
// interroga cross-schema.

export const SESSION_COOKIE = "dper_session";
export const DURATA_SESSIONE_S = 60 * 60 * 24 * 30; // 30 giorni

export type Sessione = {
  email: string; // vuota se l'ingresso è con la password d'app
  nome: string;
  ruolo: Ruolo;
  exp: number; // secondi epoch
};

function segreto(): string {
  const s = process.env.PERSONALE_SESSION_SECRET;
  if (!s) throw new Error("PERSONALE_SESSION_SECRET non impostata: la sessione non può essere firmata.");
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

// L'auth è attiva quando ci sono sia il segreto di firma sia la password d'app.
// In produzione il middleware NON lascia passare nessuno se mancano (503,
// fail-closed); in sviluppo locale la UI resta aperta in vista admin.
export function authAttiva(): boolean {
  return Boolean(process.env.PERSONALE_SESSION_SECRET && process.env.PERSONALE_APP_PASSWORD);
}

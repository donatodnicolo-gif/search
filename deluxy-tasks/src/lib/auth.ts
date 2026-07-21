import { isRuolo, type Ruolo } from "./ruoli";

// Sessione per-utente firmata (HMAC-SHA256) dentro un cookie, come il Deluxy Hub:
// il middleware la valida sull'Edge senza interrogare il database. Usa solo Web
// Crypto, quindi funziona sia nel middleware sia nelle server action.
//
// L'utente si autentica con le STESSE credenziali del Hub (vedi lib/hub-utenti.ts):
// qui conserviamo solo email, nome e ruolo per decidere cosa può vedere.

export const SESSION_COOKIE = "dt_session";
export const DURATA_SESSIONE_S = 60 * 60 * 24 * 30; // 30 giorni

export type Sessione = {
  email: string;
  nome: string;
  ruolo: Ruolo;
  exp: number; // secondi epoch
};

function segreto(): string {
  const s = process.env.TASKS_SESSION_SECRET;
  if (!s) throw new Error("TASKS_SESSION_SECRET non impostata: la sessione non può essere firmata.");
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
    if (typeof dati.email !== "string" || !isRuolo(dati.ruolo)) return null;
    return dati;
  } catch {
    return null;
  }
}

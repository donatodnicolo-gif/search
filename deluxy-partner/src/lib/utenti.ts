import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { prisma } from "./db";
import type { Ruolo } from "./sessione";

// Account personali (email + password) per chi non entra dal portale Hub.
//
// La password non si salva mai: si salva la sua impronta con **scrypt**, che è
// una funzione lenta di proposito — chi rubasse il database non può provare
// miliardi di password al secondo, come farebbe con uno SHA-256 nudo. scrypt sta
// in `node:crypto`, quindi zero dipendenze nuove; gira solo lato server (mai nel
// middleware, che è su Edge).
//
// Formato salvato: scrypt$N$r$p$<salt esadecimale>$<hash esadecimale>
// I parametri stanno DENTRO la stringa: alzandoli domani, le password vecchie
// continuano a verificarsi coi loro parametri originali.

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  opts: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

const N = 16384; // costo CPU/memoria (2^14): ~100ms per verifica
const R = 8;
const P = 1;
const LUNGHEZZA = 32;
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, LUNGHEZZA, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Confronto a tempo costante: `timingSafeEqual` non esce prima al primo byte
 *  diverso, così dal tempo di risposta non si deduce quanto ci si è avvicinati. */
export async function verificaPassword(password: string, salvato: string): Promise<boolean> {
  try {
    const [algo, n, r, p, saltHex, hashHex] = salvato.split("$");
    if (algo !== "scrypt" || !saltHex || !hashHex) return false;
    const atteso = Buffer.from(hashHex, "hex");
    const calcolato = await scrypt(password.normalize("NFKC"), Buffer.from(saltHex, "hex"), atteso.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM,
    });
    return calcolato.length === atteso.length && timingSafeEqual(calcolato, atteso);
  } catch {
    return false;
  }
}

export function normalizzaEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailValida(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Requisiti minimi della password. Volutamente pochi e chiari: una regola che
 *  nessuno capisce produce password appiccicate al monitor. */
export function problemaPassword(password: string): string | null {
  if (password.length < 10) return "La password deve avere almeno 10 caratteri.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return "La password deve contenere almeno una lettera e una cifra.";
  }
  return null;
}

export type EsitoLogin =
  | { ok: true; utente: { id: string; email: string; nome: string; ruolo: Ruolo } }
  | { ok: false; motivo: "credenziali" | "disattivato" };

/** Verifica email+password. Il messaggio d'errore per «email inesistente» e
 *  «password sbagliata» è lo STESSO (`credenziali`): distinguerli direbbe a
 *  chiunque quali indirizzi hanno un account qui dentro. */
export async function verificaCredenziali(emailGrezza: string, password: string): Promise<EsitoLogin> {
  const email = normalizzaEmail(emailGrezza);
  const u = await prisma.utenteApp.findUnique({ where: { email } });
  if (!u) {
    // Si calcola comunque un hash: senza, la risposta per un'email inesistente
    // tornerebbe molto più in fretta e si potrebbe capire chi ha un account.
    await hashPassword(password);
    return { ok: false, motivo: "credenziali" };
  }
  if (!(await verificaPassword(password, u.passwordHash))) return { ok: false, motivo: "credenziali" };
  if (!u.attivo) return { ok: false, motivo: "disattivato" };
  return {
    ok: true,
    utente: { id: u.id, email: u.email, nome: u.nome, ruolo: u.ruolo === "admin" ? "admin" : "sola_lettura" },
  };
}

export const RUOLI: { valore: Ruolo; etichetta: string; descrizione: string }[] = [
  { valore: "admin", etichetta: "Accesso pieno", descrizione: "Può vedere e modificare tutto" },
  { valore: "sola_lettura", etichetta: "Sola lettura", descrizione: "Consulta tutto, non modifica niente" },
];

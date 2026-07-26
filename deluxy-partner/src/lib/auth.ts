// Chi sta usando l'app. Due modi di entrare, che convivono:
//
//   1) ACCOUNT PERSONALE (email + password) o ingresso dal portale Hub → cookie
//      firmato che porta nome, email e ruolo (vedi `sessione.ts`). È l'unico che
//      dà un NOME alle righe del registro accessi e del registro modifiche.
//   2) PASSWORD DI TEAM → cookie = impronta della password usata. Non ha un
//      nome: sa solo dire il ruolo. Resta come porta di servizio, perché
//      togliendola di colpo chi non ha ancora un account resterebbe fuori.
//        - PARTNER_APP_PASSWORD          → accesso pieno
//        - PARTNER_APP_PASSWORD_READONLY → sola lettura
//      Se PARTNER_APP_PASSWORD non è impostata (sviluppo locale) l'app è aperta.
//
// Questo file lo importa anche `middleware.ts`, che gira su Edge: niente Prisma
// e niente `node:crypto` qui dentro.

import { leggiSessione, type DatiSessione } from "./sessione";

export const SESSION_COOKIE = "dp_session";

export type Ruolo = "admin" | "sola_lettura";

export type Sessione =
  | { tipo: "utente"; ruolo: Ruolo; nome: string; email: string; uid: string; via: "email" | "sso" }
  | { tipo: "team"; ruolo: Ruolo };

export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`deluxy-partner::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Chi è, dal valore del cookie. Prima si prova il cookie firmato (account /
 *  Hub), poi si ricade sull'impronta della password di team. */
export async function sessioneCorrente(cookieValue: string | undefined): Promise<Sessione | null> {
  if (!cookieValue) return null;

  const d: DatiSessione | null = await leggiSessione(cookieValue);
  if (d) {
    return { tipo: "utente", ruolo: d.ruolo, nome: d.nome, email: d.email, uid: d.uid, via: d.via };
  }

  const admin = process.env.PARTNER_APP_PASSWORD;
  const readonly = process.env.PARTNER_APP_PASSWORD_READONLY;
  if (admin && cookieValue === (await sessionToken(admin))) return { tipo: "team", ruolo: "admin" };
  if (readonly && cookieValue === (await sessionToken(readonly))) return { tipo: "team", ruolo: "sola_lettura" };
  return null;
}

// Ricava il ruolo dal valore del cookie di sessione (o null se non valido).
export async function ruoloDaSessione(cookieValue: string | undefined): Promise<Ruolo | null> {
  return (await sessioneCorrente(cookieValue))?.ruolo ?? null;
}

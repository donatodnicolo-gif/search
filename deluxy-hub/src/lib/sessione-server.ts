import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, leggiSessione, type Sessione } from "./session";

// Lettura della sessione lato server. Il middleware ha già bloccato le richieste
// senza cookie valido; qui la rileggiamo per sapere chi è l'utente.

export async function sessioneCorrente(): Promise<Sessione | null> {
  const jar = await cookies();
  return leggiSessione(jar.get(SESSION_COOKIE)?.value);
}

export async function richiediSessione(): Promise<Sessione> {
  const sessione = await sessioneCorrente();
  if (!sessione) redirect("/login");
  return sessione;
}

export async function richiediAdmin(): Promise<Sessione> {
  const sessione = await richiediSessione();
  if (sessione.ruolo !== "admin") redirect("/");
  return sessione;
}

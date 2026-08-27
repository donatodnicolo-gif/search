import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { isRuolo } from "./ruoli";
import { SESSION_COOKIE, leggiSessione, type Sessione } from "./session";

// Lettura della sessione lato server (runtime Node — NON l'Edge del middleware).
//
// Il cookie firmato è solo il PRIMO controllo: dice «questa firma è nostra e non
// è scaduta». Ma un cookie firmato resta valido 30 giorni, e in mezzo l'utente
// può essere disattivato, eliminato, declassato o aver cambiato password. Per
// questo qui si rilegge SEMPRE l'utente dal database: ruolo, nome e stato non
// vengono dal cookie (che è congelato al login) ma dalla riga viva. Così la
// revoca ha effetto immediato invece che fra 30 giorni.
//
// Il middleware Edge non può fare questa query (Prisma non gira sull'Edge):
// continua a filtrare sulla sola firma, e la difesa vera è qui, dove passano
// tutte le pagine, le server action e le route handler (page, /vai, download
// certificati, …). `cache()` deduplica le chiamate nella stessa richiesta, così
// il layout, la pagina e le sue guardie non fanno tre query per la stessa cosa.

export const sessioneCorrente = cache(async (): Promise<Sessione | null> => {
  const jar = await cookies();
  const cookie = await leggiSessione(jar.get(SESSION_COOKIE)?.value);
  if (!cookie) return null;

  const utente = await prisma.utente.findUnique({
    where: { id: cookie.uid },
    select: { nome: true, ruolo: true, attivo: true, sessioniValideDa: true },
  });

  // L'utente non esiste più, è disattivato, o il ruolo salvato non è valido:
  // la sessione non vale, chiunque tenga ancora il cookie viene rimandato al
  // login appena tocca una pagina.
  if (!utente || !utente.attivo || !isRuolo(utente.ruolo)) return null;

  // Revoca: se le sessioni valgono solo da una certa data (cambio password), un
  // cookie emesso prima non vale. Un cookie senza `iat` (emesso prima che questo
  // campo esistesse) conta come «emesso da sempre» → revocabile.
  if (utente.sessioniValideDa) {
    const emessoMs = (cookie.iat ?? 0) * 1000;
    if (emessoMs < utente.sessioniValideDa.getTime()) return null;
  }

  // Ruolo e nome dalla riga viva, non dal cookie: un admin declassato smette di
  // essere admin adesso, non al prossimo login.
  return { uid: cookie.uid, nome: utente.nome, ruolo: utente.ruolo, exp: cookie.exp, iat: cookie.iat };
});

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

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { hashPassword } from "./password";
import { emailValida, mandaEmail } from "./posta";
import {
  creaTokenRecupero,
  emailRecupero,
  hashIp,
  leggiTokenRecupero,
  problemaPassword,
} from "./recupero-password";

// Le due azioni del recupero password. Sono PUBBLICHE (chi le chiama non è
// loggato per definizione): ogni difesa sta qui dentro, non nel fatto che la
// pagina sia difficile da trovare.

function testo(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim();
}

// L'IP di chi chiede, per il solo scopo di contare le richieste. Su Vercel
// arriva in x-forwarded-for (il primo della lista è il client).
async function ipRichiedente(): Promise<string> {
  const h = await headers();
  const avanti = h.get("x-forwarded-for") ?? "";
  return avanti.split(",")[0]?.trim() || h.get("x-real-ip") || "";
}

// L'indirizzo pubblico del portale, per costruire il link dell'email. In
// produzione lo si prende dagli header della richiesta: così il link punta al
// dominio da cui la persona sta chiedendo, non a uno cablato nel codice.
async function origineApp(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "deluxy-hub.vercel.app";
  const schema = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${schema}://${host}`;
}

/**
 * «Ho dimenticato la password»: manda il link, se quell'email è di un account
 * attivo. La pagina risponde SEMPRE la stessa cosa — email sconosciuta,
 * account disattivato, freno scattato o email partita davvero: da fuori non si
 * distinguono. È la regola contro l'enumerazione degli utenti (Libro §14): il
 * portale è la porta della suite, e dire «questo indirizzo non risulta»
 * regalerebbe l'organico a chiunque.
 */
export async function chiediRecupero(fd: FormData) {
  const email = testo(fd, "email").toLowerCase();

  // Forma dell'indirizzo sbagliata: è l'unico caso in cui rispondere «no» non
  // rivela niente di nessuno (non è una domanda sull'esistenza di un account).
  if (!emailValida(email)) redirect("/password-dimenticata?errore=email");

  const utente = await prisma.utente.findUnique({
    where: { email },
    select: { id: true, nome: true, email: true, attivo: true },
  });

  if (utente && utente.attivo) {
    const token = await creaTokenRecupero(utente.id, hashIp(await ipRichiedente()));
    // token null = ha già chiesto troppe volte in un'ora: non si manda altro,
    // e non lo si dice (sarebbe comunque un'informazione su quell'account).
    if (token) {
      const link = `${await origineApp()}/reimposta-password?token=${encodeURIComponent(token)}`;
      const messaggio = emailRecupero(utente.nome, link);
      try {
        await mandaEmail({ a: utente.email, ...messaggio });
      } catch {
        // La posta non è configurata o il server ha rifiutato. Non si dice a
        // chi ha chiesto (rivelerebbe che l'account esiste) e non si scrive il
        // motivo con dentro l'indirizzo: chi amministra lo vede da /cartellino
        // → stato della posta, e in ogni caso il token scadrà da solo.
        console.warn("Recupero password: invio email fallito");
      }
    }
  }

  redirect("/password-dimenticata?fatto=1");
}

/**
 * Il secondo tempo: arriva col token nell'URL e sceglie la password nuova.
 * Il token si spende qui — e nella stessa transazione si chiudono tutte le
 * sessioni aperte di quella persona: se qualcuno era entrato con la vecchia
 * password (o con un cookie rubato), da questo momento è fuori.
 */
export async function reimpostaPassword(fd: FormData) {
  const token = testo(fd, "token");
  const password = String(fd.get("password") ?? "");
  const conferma = String(fd.get("conferma") ?? "");

  const esito = await leggiTokenRecupero(token);
  // Token assente, scaduto, già speso o di un utente disattivato: stesso
  // messaggio per tutti i casi, e si riparte dalla richiesta.
  if (!esito.valido) redirect("/reimposta-password?errore=token");

  if (password !== conferma) {
    redirect(`/reimposta-password?token=${encodeURIComponent(token)}&errore=diverse`);
  }
  const problema = problemaPassword(password, { email: esito.email, nome: esito.nome });
  if (problema) {
    redirect(`/reimposta-password?token=${encodeURIComponent(token)}&errore=${problema}`);
  }

  const hash = await hashPassword(password);
  // Troncato al secondo perché l'`iat` del cookie è in secondi: con i
  // millisecondi, un cookie emesso nello stesso secondo sopravviverebbe.
  const adesso = new Date(Math.floor(Date.now() / 1000) * 1000);

  // Un'unica transazione: password nuova + sessioni chiuse + token bruciato.
  // Separandole, un errore in mezzo lascerebbe un token ancora spendibile o una
  // password cambiata con le vecchie sessioni ancora aperte.
  await prisma.$transaction([
    prisma.utente.update({
      where: { id: esito.utenteId },
      data: { passwordHash: hash, sessioniValideDa: adesso },
    }),
    prisma.tokenReset.update({ where: { id: esito.tokenId }, data: { usatoIl: adesso } }),
    // Gli altri link non ancora usati di quella persona muoiono qui: dopo un
    // recupero riuscito non deve restare in giro nessuna seconda chiave.
    prisma.tokenReset.updateMany({
      where: { utenteId: esito.utenteId, usatoIl: null },
      data: { usatoIl: adesso },
    }),
  ]);

  redirect("/login?reimpostata=1");
}

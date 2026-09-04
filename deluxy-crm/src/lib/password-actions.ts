"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authAttiva } from "./auth";
import { chiaveApp } from "./chiavi-app";
import { inviaMail } from "./mail";
import {
  cambiaPasswordSquadra,
  creaTokenReset,
  hashIp,
  leggiTokenReset,
  mailReset,
  reimpostaConToken,
} from "./password-team";
import { sessioneOppureFuori } from "./sessione-server";

// Le azioni della password di squadra. Le prime due sono PUBBLICHE (chi le
// chiama non è dentro, per definizione): ogni difesa sta qui, non nel fatto
// che la pagina sia difficile da trovare.

function testo(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim();
}

// L'IP di chi chiede, solo per contare. Su Vercel arriva in x-forwarded-for.
async function ipRichiedente(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "";
}

// L'indirizzo pubblico dell'app per il link: FISSO (CRM_URL, o il dominio di
// produzione), mai dagli header della richiesta. Un host preso dalla richiesta
// è il reset-poisoning classico (chi chiede il reset con un host suo riceve il
// token dell'amministratore che clicca), e una preview con lo stesso database
// manderebbe link sul dominio della preview (ostile 04/09, f2).
async function origineApp(): Promise<string> {
  return ((await chiaveApp("CRM_URL")) ?? "https://deluxy-crm.vercel.app").replace(/\/$/, "");
}

// La casella che riceve il link: sempre la stessa, di amministrazione. Non
// c'è un utente da riconoscere e nessun indirizzo si digita nel modulo.
async function casellaReset(): Promise<string | null> {
  return (await chiaveApp("CRM_RESET_EMAIL")) ?? (await chiaveApp("MAIL_UTENTE"));
}

/**
 * «Password dimenticata?»: parte il link alla casella di amministrazione.
 * La risposta è SEMPRE la stessa — link partito, freno scattato, posta non
 * configurata: da fuori non si distinguono, così il modulo pubblico non dice
 * niente a nessuno. Chi amministra vede lo stato della posta in Impostazioni.
 */
export async function chiediResetPassword(): Promise<void> {
  if (!authAttiva()) redirect("/"); // sviluppo locale: la porta è già aperta
  const a = await casellaReset();
  if (a) {
    const token = await creaTokenReset(hashIp(await ipRichiedente()));
    if (token) {
      const link = `${await origineApp()}/reimposta-password?token=${encodeURIComponent(token)}`;
      const esito = await inviaMail({ a, ...mailReset(link) });
      // Il motivo resta nel log del server, mai in pagina (e mai il token).
      if (!esito.ok) console.warn(`Reset password: mail non partita — ${esito.errore}`);
    }
  }
  redirect("/login?reset=inviato");
}

/** Il secondo tempo: col token nell'URL si sceglie la password nuova. */
export async function reimpostaPasswordConLink(fd: FormData): Promise<void> {
  const token = testo(fd, "token");
  const password = String(fd.get("password") ?? "");
  const conferma = String(fd.get("conferma") ?? "");

  const esito = await leggiTokenReset(token);
  if (!esito.valido) redirect("/reimposta-password?errore=token");
  if (password !== conferma) redirect(`/reimposta-password?token=${encodeURIComponent(token)}&errore=diverse`);

  const risultato = await reimpostaConToken(esito.tokenId, password);
  if (risultato === "token") redirect("/reimposta-password?errore=token"); // bruciato nel frattempo
  if (risultato !== "ok") redirect(`/reimposta-password?token=${encodeURIComponent(token)}&errore=${risultato}`);
  redirect("/login?reimpostata=1");
}

/**
 * Cambio dall'interno (Impostazioni): chi è dentro, con la password attuale.
 * Dall'SSO possono farlo solo gli admin del Hub. A cambio fatto escono tutti,
 * chi cambia compreso: si rientra con quella nuova.
 */
export async function cambiaPasswordDaImpostazioni(fd: FormData): Promise<void> {
  const sessione = await sessioneOppureFuori();
  if (authAttiva() && !sessione) redirect("/logout");
  if (sessione && sessione.via === "sso" && sessione.ruolo !== "admin") redirect("/impostazioni?password=vietato");

  // L'admin del Hub (SSO) non deve conoscere la password attuale: la sua
  // identità vale più del segreto condiviso, ed è la via per espellere chi ha
  // la password anche a posta spenta. Con la password di squadra serve quella attuale.
  const adminHub = Boolean(sessione && sessione.via === "sso" && sessione.ruolo === "admin");
  const attuale = adminHub ? null : String(fd.get("attuale") ?? "");
  const nuova = String(fd.get("nuova") ?? "");
  const conferma = String(fd.get("conferma") ?? "");
  if (nuova !== conferma) redirect("/impostazioni?password=diverse");

  const esito = await cambiaPasswordSquadra(attuale, nuova, sessione?.nome ?? "sviluppo locale");
  if (esito !== "ok") redirect(`/impostazioni?password=${esito}`);
  redirect("/logout?reimpostata=1");
}

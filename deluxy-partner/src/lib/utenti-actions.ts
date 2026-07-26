"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { sessioneCorrente } from "./auth";
import { registra } from "./registro";
import { hashPassword, normalizzaEmail, emailValida, problemaPassword, verificaPassword } from "./utenti";

// Gestione degli account personali. Il middleware già rifiuta ogni POST al
// profilo di sola lettura, ma il controllo è ripetuto qui: queste azioni creano
// credenziali d'accesso, ed è il punto sbagliato dove fidarsi di un solo
// cancello.

async function soloAdmin(): Promise<void> {
  const jar = await cookies();
  const s = await sessioneCorrente(jar.get("dp_session")?.value);
  // In sviluppo locale senza password l'app è aperta: nessuna sessione, nessun blocco.
  if (!process.env.PARTNER_APP_PASSWORD) return;
  if (s?.ruolo !== "admin") redirect("/impostazioni/utenti?errore=Solo+un+amministratore+pu%C3%B2+gestire+gli+utenti.");
}

function torna(errore?: string, ok?: string): never {
  const qs = new URLSearchParams();
  if (errore) qs.set("errore", errore);
  if (ok) qs.set("ok", ok);
  revalidatePath("/impostazioni/utenti");
  redirect(`/impostazioni/utenti${qs.toString() ? `?${qs}` : ""}`);
}

// ————— La MIA password (la cambia la persona stessa) —————
// Non è un'azione da amministratore: la può fare chiunque abbia un account, ed
// è l'unico modo perché la password iniziale — scelta da un altro e comunicata
// a voce — smetta di essere conosciuta da due persone.
function tornaPassword(errore?: string, ok?: string): never {
  const qs = new URLSearchParams();
  if (errore) qs.set("errore", errore);
  if (ok) qs.set("ok", ok);
  revalidatePath("/impostazioni/password");
  redirect(`/impostazioni/password${qs.toString() ? `?${qs}` : ""}`);
}

export async function cambiaPasswordPropria(fd: FormData) {
  const jar = await cookies();
  const s = await sessioneCorrente(jar.get("dp_session")?.value);
  if (s?.tipo !== "utente" || s.via !== "email") {
    tornaPassword("Qui si cambia la password del proprio account: sei entrato in un altro modo.");
  }

  const attuale = String(fd.get("attuale") ?? "");
  const nuova = String(fd.get("nuova") ?? "");
  const conferma = String(fd.get("conferma") ?? "");

  const u = await prisma.utenteApp.findUnique({ where: { id: s.uid } });
  if (!u) tornaPassword("Account non trovato: esci e rientra.");

  // La password attuale si chiede sempre: senza, chi trovasse il computer
  // sbloccato potrebbe cambiarla e prendersi l'account.
  if (!(await verificaPassword(attuale, u.passwordHash))) {
    tornaPassword("La password attuale non è corretta.");
  }
  if (nuova !== conferma) tornaPassword("Le due nuove password non coincidono.");
  const problema = problemaPassword(nuova);
  if (problema) tornaPassword(problema);
  if (await verificaPassword(nuova, u.passwordHash)) {
    tornaPassword("La nuova password è uguale a quella attuale.");
  }

  await prisma.utenteApp.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(nuova) } });
  await registra({
    azione: `${u.nome} ha cambiato la propria password`,
    categoria: "impostazioni",
    entita: "utente",
    entitaId: u.id,
  });
  tornaPassword(undefined, "Password aggiornata. Da adesso entri con quella nuova.");
}

export async function creaUtente(fd: FormData) {
  await soloAdmin();
  const email = normalizzaEmail(String(fd.get("email") ?? ""));
  const nome = String(fd.get("nome") ?? "").trim();
  const ruolo = String(fd.get("ruolo") ?? "sola_lettura") === "admin" ? "admin" : "sola_lettura";
  const password = String(fd.get("password") ?? "");

  if (!emailValida(email)) torna("Email non valida.");
  if (!nome) torna("Il nome è obbligatorio: è quello che comparirà nei registri.");
  const problema = problemaPassword(password);
  if (problema) torna(problema);
  if (await prisma.utenteApp.findUnique({ where: { email } })) torna(`Esiste già un utente con l'email ${email}.`);

  const u = await prisma.utenteApp.create({
    data: { email, nome, ruolo, passwordHash: await hashPassword(password) },
  });
  await registra({
    azione: `Nuovo utente ${nome} (${email})`,
    categoria: "impostazioni",
    entita: "utente",
    entitaId: u.id,
    dettaglio: ruolo === "admin" ? "accesso pieno" : "sola lettura",
  });
  torna(undefined, `Utente ${nome} creato.`);
}

export async function aggiornaUtente(id: string, fd: FormData) {
  await soloAdmin();
  const nome = String(fd.get("nome") ?? "").trim();
  const ruolo = String(fd.get("ruolo") ?? "sola_lettura") === "admin" ? "admin" : "sola_lettura";
  const attivo = fd.get("attivo") != null;
  if (!nome) torna("Il nome è obbligatorio.");

  const prima = await prisma.utenteApp.findUnique({ where: { id } });
  if (!prima) torna("Utente non trovato.");

  // Non lasciare l'app senza nessuno che possa amministrarla: se questo è
  // l'ultimo admin attivo, declassarlo o spegnerlo chiuderebbe la porta.
  if (prima.ruolo === "admin" && prima.attivo && (ruolo !== "admin" || !attivo)) {
    const altri = await prisma.utenteApp.count({ where: { ruolo: "admin", attivo: true, id: { not: id } } });
    if (altri === 0) torna("È l'ultimo amministratore attivo: prima nominane un altro.");
  }

  await prisma.utenteApp.update({ where: { id }, data: { nome, ruolo, attivo } });
  await registra({
    azione: `Utente ${prima.email} aggiornato`,
    categoria: "impostazioni",
    entita: "utente",
    entitaId: id,
    dettaglio: `${ruolo === "admin" ? "accesso pieno" : "sola lettura"} · ${attivo ? "attivo" : "disattivato"}`,
  });
  torna(undefined, `Utente ${nome} aggiornato.`);
}

export async function reimpostaPassword(id: string, fd: FormData) {
  await soloAdmin();
  const password = String(fd.get("password") ?? "");
  const problema = problemaPassword(password);
  if (problema) torna(problema);

  const u = await prisma.utenteApp.findUnique({ where: { id } });
  if (!u) torna("Utente non trovato.");

  await prisma.utenteApp.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
  // Nel registro NON finisce la password, ovviamente: solo il fatto.
  await registra({
    azione: `Password reimpostata per ${u.email}`,
    categoria: "impostazioni",
    entita: "utente",
    entitaId: id,
  });
  torna(undefined, `Password di ${u.nome} reimpostata. Comunicagliela e falla cambiare.`);
}

export async function eliminaUtente(id: string) {
  await soloAdmin();
  const u = await prisma.utenteApp.findUnique({ where: { id } });
  if (!u) torna("Utente non trovato.");
  if (u.ruolo === "admin" && u.attivo) {
    const altri = await prisma.utenteApp.count({ where: { ruolo: "admin", attivo: true, id: { not: id } } });
    if (altri === 0) torna("È l'ultimo amministratore attivo: non si può eliminare.");
  }
  await prisma.utenteApp.delete({ where: { id } });
  // Le righe del registro accessi restano: sono la storia di chi è entrato, e
  // cancellarle insieme all'utente vorrebbe dire perdere proprio la traccia che
  // serve dopo aver tolto l'accesso a qualcuno.
  await registra({
    azione: `Utente ${u.nome} (${u.email}) eliminato`,
    categoria: "impostazioni",
    entita: "utente",
    entitaId: id,
    dettaglio: "gli accessi già registrati restano nello storico",
  });
  torna(undefined, `Utente ${u.nome} eliminato.`);
}

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { hashPassword, verificaPassword } from "./password";
import { SESSION_COOKIE, DURATA_SESSIONE_S, creaSessione } from "./session";
import { richiediAdmin, sessioneCorrente } from "./sessione-server";
import { isRuolo, type Ruolo } from "./ruoli";
import { idAppValidi } from "./apps";

function testo(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim();
}

// Le app spuntate nel form arrivano come più campi "app" con lo stesso nome.
// Teniamo solo gli id che corrispondono a un'app reale del catalogo.
function appSelezionate(fd: FormData): string[] {
  return idAppValidi(fd.getAll("app").map((v) => String(v)));
}

export async function accedi(fd: FormData) {
  const email = testo(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const da = testo(fd, "da");

  const utente = await prisma.utente.findUnique({ where: { email } });

  // Messaggio unico per email inesistente, password errata e utente disattivato:
  // non riveliamo quali email esistono.
  const ok =
    utente !== null && utente.attivo && (await verificaPassword(password, utente.passwordHash));
  if (!utente || !ok) {
    redirect(`/login?errore=1${da ? `&da=${encodeURIComponent(da)}` : ""}`);
  }

  await prisma.utente.update({
    where: { id: utente.id },
    data: { ultimoAccesso: new Date() },
  });

  const token = await creaSessione({
    uid: utente.id,
    nome: utente.nome,
    ruolo: utente.ruolo as Ruolo,
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: DURATA_SESSIONE_S,
    path: "/",
  });

  redirect(da && da.startsWith("/") ? da : "/");
}

export async function esci() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function creaUtente(fd: FormData) {
  await richiediAdmin();

  const email = testo(fd, "email").toLowerCase();
  const nome = testo(fd, "nome");
  const password = String(fd.get("password") ?? "");
  const ruolo = testo(fd, "ruolo");

  if (!email || !nome || password.length < 8 || !isRuolo(ruolo)) {
    redirect("/utenti?errore=dati");
  }
  if (await prisma.utente.findUnique({ where: { email } })) {
    redirect("/utenti?errore=esiste");
  }

  await prisma.utente.create({
    data: {
      email,
      nome,
      ruolo,
      appAbilitate: appSelezionate(fd),
      passwordHash: await hashPassword(password),
    },
  });

  revalidatePath("/utenti");
  redirect("/utenti?ok=creato");
}

export async function aggiornaUtente(fd: FormData) {
  await richiediAdmin();

  const id = testo(fd, "id");
  const nome = testo(fd, "nome");
  const ruolo = testo(fd, "ruolo");
  const attivo = fd.get("attivo") === "on";
  const password = String(fd.get("password") ?? "");

  if (!id || !nome || !isRuolo(ruolo)) redirect("/utenti?errore=dati");

  const dati: {
    nome: string;
    ruolo: Ruolo;
    attivo: boolean;
    appAbilitate: string[];
    passwordHash?: string;
  } = {
    nome,
    ruolo,
    attivo,
    appAbilitate: appSelezionate(fd),
  };
  if (password) {
    if (password.length < 8) redirect("/utenti?errore=password");
    dati.passwordHash = await hashPassword(password);
  }

  await prisma.utente.update({ where: { id }, data: dati });

  revalidatePath("/utenti");
  redirect("/utenti?ok=aggiornato");
}

export async function eliminaUtente(fd: FormData) {
  const sessione = await richiediAdmin();
  const id = testo(fd, "id");

  // Un admin non può cancellare se stesso: eviterebbe di chiudersi fuori dal portale.
  if (id === sessione.uid) redirect("/utenti?errore=se-stesso");

  await prisma.utente.delete({ where: { id } });

  revalidatePath("/utenti");
  redirect("/utenti?ok=eliminato");
}

export async function cambiaMiaPassword(fd: FormData) {
  const sessione = await sessioneCorrente();
  if (!sessione) redirect("/login");

  const attuale = String(fd.get("attuale") ?? "");
  const nuova = String(fd.get("nuova") ?? "");

  const utente = await prisma.utente.findUnique({ where: { id: sessione.uid } });
  if (!utente || !(await verificaPassword(attuale, utente.passwordHash))) {
    redirect("/profilo?errore=attuale");
  }
  if (nuova.length < 8) redirect("/profilo?errore=corta");

  await prisma.utente.update({
    where: { id: utente.id },
    data: { passwordHash: await hashPassword(nuova) },
  });

  redirect("/profilo?ok=1");
}

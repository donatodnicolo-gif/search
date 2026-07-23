"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { cifra } from "./cifratura";
import { hashToken } from "./token-api";
import { idAppValidi } from "./apps";
import { richiediAdmin } from "./sessione-server";

// Server action della pagina /chiavi (solo admin). Come per gli utenti, il
// middleware blocca la rotta ma ogni azione ricontrolla il ruolo lato server.

function testo(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim();
}

function suffissoDi(valore: string): string {
  return valore.slice(-4);
}

export async function creaChiave(fd: FormData) {
  await richiediAdmin();

  const progetto = testo(fd, "progetto");
  const nome = testo(fd, "nome");
  const valore = String(fd.get("valore") ?? "").trim();
  const note = testo(fd, "note");

  if (!progetto || !nome || !valore) redirect("/chiavi?errore=dati");

  const esiste = await prisma.chiave.findUnique({
    where: { progetto_nome: { progetto, nome } },
  });
  if (esiste) redirect("/chiavi?errore=esiste");

  let valoreCifrato: string;
  try {
    valoreCifrato = cifra(valore);
  } catch {
    redirect("/chiavi?errore=segreto");
  }

  await prisma.chiave.create({
    data: { progetto, nome, valoreCifrato, suffisso: suffissoDi(valore), note },
  });

  revalidatePath("/chiavi");
  redirect("/chiavi?ok=creata");
}

export async function aggiornaChiave(fd: FormData) {
  await richiediAdmin();

  const id = testo(fd, "id");
  const valore = String(fd.get("valore") ?? "").trim();
  const note = testo(fd, "note");

  if (!id) redirect("/chiavi?errore=dati");

  // Valore vuoto = invariato: si possono aggiornare solo le note.
  const dati: { note: string; valoreCifrato?: string; suffisso?: string } = { note };
  if (valore) {
    try {
      dati.valoreCifrato = cifra(valore);
    } catch {
      redirect("/chiavi?errore=segreto");
    }
    dati.suffisso = suffissoDi(valore);
  }

  await prisma.chiave.update({ where: { id }, data: dati });

  revalidatePath("/chiavi");
  redirect("/chiavi?ok=aggiornata");
}

export async function eliminaChiave(fd: FormData) {
  await richiediAdmin();

  const id = testo(fd, "id");
  if (!id) redirect("/chiavi?errore=dati");

  await prisma.chiave.delete({ where: { id } });

  revalidatePath("/chiavi");
  redirect("/chiavi?ok=eliminata");
}

// --- Token di servizio per l'API di lettura (GET /api/chiavi) ---

// Il token in chiaro lo genera il browser (crypto sicuro) e arriva qui già
// pronto: noi salviamo solo il suo SHA-256, così sul database non c'è mai il
// valore. `progetti` limita cosa può leggere (nessuna spunta = tutti).
export async function creaToken(fd: FormData) {
  await richiediAdmin();

  const nome = testo(fd, "nome");
  const token = String(fd.get("token") ?? "").trim();
  const progetti = idAppValidi(fd.getAll("progetti").map((v) => String(v)));

  // Il token deve essere lungo: se il campo è vuoto o corto, il browser non ha
  // generato nulla (JS disattivato) — non salviamo un token debole.
  if (!nome || token.length < 24) redirect("/chiavi?errore=token");

  const hash = hashToken(token);
  if (await prisma.tokenApi.findUnique({ where: { hash } })) {
    redirect("/chiavi?errore=token-esiste");
  }

  await prisma.tokenApi.create({ data: { nome, hash, progetti } });

  revalidatePath("/chiavi");
  redirect("/chiavi?ok=token-creato");
}

export async function revocaToken(fd: FormData) {
  await richiediAdmin();

  const id = testo(fd, "id");
  if (!id) redirect("/chiavi?errore=dati");

  await prisma.tokenApi.delete({ where: { id } });

  revalidatePath("/chiavi");
  redirect("/chiavi?ok=token-revocato");
}

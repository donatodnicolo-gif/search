"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { cifra } from "./cifratura";
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

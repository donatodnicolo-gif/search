"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";

// I **temi**: raggruppamenti liberi di collezioni. Nessun criterio automatico —
// chi ci sta dentro lo decide una persona, ed è tutta la differenza con le
// tipologie, che si definiscono per criteri sui prodotti.

export async function creaTema(fd: FormData) {
  const nome = String(fd.get("nome") ?? "").trim();
  if (!nome) {
    redirect("/collezioni/temi?esito=errore&messaggio=" + encodeURIComponent("Il nome serve: è come si ritrova il tema."));
  }
  const esiste = await prisma.temaCollezioni.findUnique({ where: { nome }, select: { id: true } });
  if (esiste) {
    redirect(`/collezioni/temi?esito=errore&messaggio=${encodeURIComponent(`Esiste già un tema «${nome}».`)}`);
  }
  const t = await prisma.temaCollezioni.create({
    data: { nome, descrizione: String(fd.get("descrizione") ?? "").trim() || null },
  });
  // Dritti dentro: un tema senza collezioni non serve a niente, e il passo
  // successivo è sempre assegnargliele.
  redirect(`/collezioni/temi/${t.id}`);
}

export async function rinominaTema(id: string, fd: FormData) {
  const nome = String(fd.get("nome") ?? "").trim();
  const descrizione = String(fd.get("descrizione") ?? "").trim() || null;
  if (nome) await prisma.temaCollezioni.update({ where: { id }, data: { nome, descrizione } });
  revalidatePath(`/collezioni/temi/${id}`);
}

/**
 * Elimina un tema. **Le collezioni non si toccano**: un tema è un modo di
 * guardarle, non qualcosa che le possiede. Sparisce l'etichetta, restano le
 * collezioni con il loro ordine e la loro tipologia.
 */
export async function eliminaTema(id: string) {
  await prisma.temaCollezioni.delete({ where: { id } });
  redirect("/collezioni/temi");
}

/**
 * Assegna in blocco: le collezioni scelte **si aggiungono** a quelle già nel
 * tema invece di sostituirle. Sostituire vorrebbe dire che riaprire la pagina e
 * salvare senza scegliere niente svuota il tema — un modo silenzioso di perdere
 * lavoro.
 */
export async function aggiungiCollezioniATema(id: string, fd: FormData) {
  const ids = fd.getAll("collezioneId").map(String).filter(Boolean);
  if (ids.length === 0) return;
  await prisma.temaCollezioni.update({
    where: { id },
    data: { collezioni: { connect: ids.map((x) => ({ id: x })) } },
  });
  revalidatePath(`/collezioni/temi/${id}`);
  revalidatePath("/collezioni");
}

/** Toglie una collezione dal tema. La collezione resta esattamente com'è. */
export async function togliCollezioneDaTema(id: string, collezioneId: string) {
  await prisma.temaCollezioni.update({ where: { id }, data: { collezioni: { disconnect: { id: collezioneId } } } });
  revalidatePath(`/collezioni/temi/${id}`);
  revalidatePath("/collezioni");
}

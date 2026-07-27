"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { chiaveDa } from "./classificazione";
import { prisma } from "./db";

function testo(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}

function intero(fd: FormData, k: string, def = 0): number {
  const n = parseInt(testo(fd, k), 10);
  return Number.isFinite(n) ? n : def;
}

function tornaA(esito: string, messaggio?: string) {
  const q = new URLSearchParams({ esito });
  if (messaggio) q.set("messaggio", messaggio);
  redirect(`/classificazione?${q}`);
}

function aggiornaTutto() {
  for (const p of ["/classificazione", "/anagrafica", "/prodotti", "/assortimento", "/vendite", "/classifiche"])
    revalidatePath(p);
}

// ---------- Categorie ----------

export async function salvaCategoriaAzione(fd: FormData) {
  const nome = testo(fd, "nome");
  if (!nome) tornaA("errore", "Serve il nome della categoria.");
  const chiave = testo(fd, "chiave") || chiaveDa(nome);
  const dati = {
    nome,
    descrizione: testo(fd, "descrizione") || null,
    ordine: intero(fd, "ordine"),
    attiva: fd.get("attiva") != null,
  };
  await prisma.categoriaProdotto.upsert({ where: { chiave }, create: { chiave, ...dati }, update: dati });
  aggiornaTutto();
  tornaA("categoria");
}

/**
 * Elimina una categoria solo se non la usa nessuno: spostare d'ufficio i
 * prodotti altrove sarebbe una riclassificazione silenziosa, e chi guarda i
 * numeri domani non saprebbe perché sono cambiati.
 */
export async function eliminaCategoriaAzione(chiave: string) {
  const usata = await prisma.prodotto.count({ where: { categoria: chiave } });
  if (usata > 0)
    tornaA("errore", `«${chiave}» è ancora la categoria di ${usata} prodotti: spostali prima di eliminarla.`);
  await prisma.categoriaProdotto.delete({ where: { chiave } });
  aggiornaTutto();
  tornaA("categoria-tolta");
}

// ---------- Linee ----------

export async function salvaLineaAzione(fd: FormData) {
  const nome = testo(fd, "nome");
  if (!nome) tornaA("errore", "Serve il nome della linea.");
  const id = testo(fd, "id");
  const dati = {
    nome,
    descrizione: testo(fd, "descrizione") || null,
    ordine: intero(fd, "ordine"),
    attiva: fd.get("attiva") != null,
  };
  try {
    if (id) await prisma.lineaProdotto.update({ where: { id }, data: dati });
    else await prisma.lineaProdotto.create({ data: dati });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    tornaA("errore", m.includes("Unique constraint") ? `Esiste già una linea «${nome}».` : "Salvataggio non riuscito.");
  }
  aggiornaTutto();
  tornaA("linea");
}

export async function eliminaLineaAzione(id: string) {
  const usata = await prisma.prodotto.count({ where: { lineaId: id } });
  if (usata > 0) tornaA("errore", `Questa linea è ancora su ${usata} prodotti: toglila da loro prima.`);
  await prisma.lineaProdotto.delete({ where: { id } });
  aggiornaTutto();
  tornaA("linea-tolta");
}

// ---------- Collezioni della maison ----------

export async function salvaCollezioneAzione(fd: FormData) {
  const nome = testo(fd, "nome");
  if (!nome) tornaA("errore", "Serve il nome della collezione.");
  const id = testo(fd, "id");
  const dati = {
    nome,
    descrizione: testo(fd, "descrizione") || null,
    stagione: testo(fd, "stagione") || "SS26",
    anno: intero(fd, "anno", new Date().getFullYear()),
  };
  if (id) await prisma.collezione.update({ where: { id }, data: dati });
  else await prisma.collezione.create({ data: dati });
  aggiornaTutto();
  revalidatePath("/collezioni");
  tornaA("collezione");
}

// ---------- Esclusione dalle analisi ----------

/**
 * Toglie (o rimette) un prodotto dalle analisi. Non cancella niente: il
 * prodotto resta in anagrafica con scritto perché è fuori, così tra sei mesi si
 * capisce chi l'ha tolto e per quale ragione.
 */
export async function escludiProdottoAzione(id: string, escludi: boolean, fd?: FormData) {
  await prisma.prodotto.update({
    where: { id },
    data: {
      esclusoDaAnalisi: escludi,
      motivoEsclusione: escludi ? (fd ? testo(fd, "motivo") || "Non è un prodotto" : "Non è un prodotto") : null,
    },
  });
  for (const p of ["/anagrafica", "/classifiche", "/vendite", "/assortimento", "/riordini", "/prodotti"])
    revalidatePath(p);
}

/** Assegna categoria e/o linea a un prodotto dall'anagrafica, senza aprirlo. */
export async function classificaProdottoAzione(id: string, fd: FormData) {
  const categoria = testo(fd, "categoria");
  const lineaId = testo(fd, "lineaId");
  await prisma.prodotto.update({
    where: { id },
    data: {
      ...(categoria ? { categoria } : {}),
      lineaId: lineaId || null,
    },
  });
  for (const p of ["/anagrafica", "/assortimento", "/prodotti"]) revalidatePath(p);
}

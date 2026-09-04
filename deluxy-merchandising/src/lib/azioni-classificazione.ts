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
    // Per quale brand/negozio vale (04/09/2026): vuoto = per tutti.
    negozio: testo(fd, "negozio") || null,
    ordine: intero(fd, "ordine"),
    attiva: fd.get("attiva") != null,
  };
  await prisma.categoriaProdotto.upsert({ where: { chiave }, create: { chiave, ...dati }, update: dati });
  aggiornaTutto();
  tornaA("categoria");
}

/**
 * Elimina una categoria. Se ci sono prodotti dentro, **si dice dove vanno**:
 * la destinazione arriva dal form (di norma «Da classificare»). Non si spostano
 * di nascosto e non si blocca l'eliminazione: chi elimina sceglie, e il
 * messaggio racconta quanti prodotti sono stati spostati e dove.
 */
export async function eliminaCategoriaAzione(chiave: string, fd?: FormData) {
  const usata = await prisma.prodotto.count({ where: { categoria: chiave } });
  const destinazione = (fd ? testo(fd, "destinazione") : "") || "DA_CLASSIFICARE";

  if (usata > 0) {
    if (destinazione === chiave) tornaA("errore", "La destinazione non può essere la categoria che stai eliminando.");
    const esiste = await prisma.categoriaProdotto.findUnique({ where: { chiave: destinazione } });
    if (!esiste) tornaA("errore", `La categoria di destinazione «${destinazione}» non esiste.`);
    await prisma.prodotto.updateMany({ where: { categoria: chiave }, data: { categoria: destinazione } });
  }

  await prisma.categoriaProdotto.delete({ where: { chiave } });
  aggiornaTutto();
  tornaA(
    "categoria-tolta",
    usata > 0
      ? `Categoria eliminata: ${usata} prodotti spostati in «${destinazione}».`
      : "Categoria eliminata: non la usava nessun prodotto."
  );
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

/**
 * Elimina una linea. I prodotti che la portavano restano dove sono, senza
 * linea: una linea è un'etichetta, toglierla non cambia cos'è il prodotto.
 */
export async function eliminaLineaAzione(id: string) {
  const usata = await prisma.prodotto.count({ where: { lineaId: id } });
  if (usata > 0) await prisma.prodotto.updateMany({ where: { lineaId: id }, data: { lineaId: null } });
  await prisma.lineaProdotto.delete({ where: { id } });
  aggiornaTutto();
  tornaA(
    "linea-tolta",
    usata > 0 ? `Linea eliminata: tolta da ${usata} prodotti, che restano al loro posto.` : "Linea eliminata."
  );
}

/**
 * Elimina una collezione di maison. I prodotti restano: perdono solo
 * l'appartenenza (`collezioneId` va a null per come è definita la relazione).
 * Le collezioni **Shopify** non si toccano da qui: quelle sono la vetrina del
 * sito e si rifanno con un import.
 */
export async function eliminaCollezioneAzione(id: string) {
  const quanti = await prisma.prodotto.count({ where: { collezioneId: id } });
  const collezione = await prisma.collezione.findUnique({ where: { id }, select: { nome: true } });
  await prisma.collezione.delete({ where: { id } });
  aggiornaTutto();
  revalidatePath("/collezioni");
  tornaA(
    "collezione-tolta",
    quanti > 0
      ? `Collezione «${collezione?.nome ?? ""}» eliminata: ${quanti} prodotti restano, senza collezione.`
      : `Collezione «${collezione?.nome ?? ""}» eliminata.`
  );
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

// ---------- Corrispondenza categorie Shopify → nostre ----------

/**
 * Dice a quale nostra categoria corrisponde una categoria vista sul negozio.
 * Salva soltanto la corrispondenza: i prodotti non si muovono finché non lo si
 * chiede, perché riclassificare 600 prodotti è una decisione, non un effetto
 * collaterale di una tendina.
 */
export async function collegaCategoriaShopifyAzione(id: string, fd: FormData) {
  const categoriaDeluxy = testo(fd, "categoriaDeluxy") || null;
  await prisma.categoriaShopify.update({ where: { id }, data: { categoriaDeluxy } });
  revalidatePath("/classificazione");
}

/** Applica la corrispondenza ai prodotti: qui sì che si riclassifica. */
export async function applicaCategoriaShopifyAzione(id: string) {
  const c = await prisma.categoriaShopify.findUnique({ where: { id } });
  if (!c?.categoriaDeluxy) tornaA("errore", "Prima scegli a quale categoria nostra corrisponde.");

  const dove =
    c!.origine === "tassonomia" ? { categoriaShopifyId: c!.chiave } : { tipoShopify: c!.chiave };
  const esito = await prisma.prodotto.updateMany({
    where: dove,
    data: { categoria: c!.categoriaDeluxy as string },
  });
  aggiornaTutto();
  tornaA(
    "categoria",
    `«${c!.nome}» applicata: ${esito.count} prodotti ora sono in «${c!.categoriaDeluxy}».`
  );
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

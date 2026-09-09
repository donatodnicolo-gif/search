"use server";

// **Le sezioni della scheda: chi c'è, in che ordine, e su quale sito.**
//
// Richiesta dell'utente (09/09/2026): «rispetta l'ordine delle sezioni di ogni
// categoria per come è impostato: consenti per ogni categoria di decidere
// l'ordine delle sezioni da pubblicare».
//
// La prima metà era già vera — `sezioniDaScrivere` ordina per `ordine` e la
// composizione lo rispetta — ma la seconda no: **non esisteva nessuna pagina
// per deciderlo**. `SezioneCategoria` si leggeva e basta; l'ordine era quello
// che avevano lasciato gli import. Qui si scrive.
//
// ⚠️ L'ordine conta sul serio: è la sequenza delle **tab che vede il cliente**
// sulla scheda del prodotto. Cambiare `ordine` qui cambia il sito al prossimo
// salvataggio del prodotto — non subito, e non da solo.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";

function testo(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}

function torna(esito: "ok" | "no", messaggio: string): never {
  redirect(`/sezioni?esito=${esito}&messaggio=${encodeURIComponent(messaggio)}`);
}

/** Riordina le sezioni di una categoria (e di un sito): arriva l'elenco degli id nell'ordine voluto. */
export async function salvaOrdineSezioniAzione(fd: FormData) {
  const ids = testo(fd, "ordineJson");
  let elenco: string[] = [];
  try {
    const v = JSON.parse(ids || "[]");
    if (Array.isArray(v)) elenco = v.map(String).filter(Boolean);
  } catch {
    torna("no", "Non ho capito il nuovo ordine.");
  }
  if (!elenco.length) torna("no", "Nessuna sezione da riordinare.");

  // ⚠️ Si scrive solo su sezioni che esistono davvero: un id inventato dal
  // form non deve poter creare righe né toccarne altre.
  const vere = await prisma.sezioneCategoria.findMany({
    where: { id: { in: elenco } },
    select: { id: true },
  });
  const validi = new Set(vere.map((x) => x.id));
  const daScrivere = elenco.filter((x) => validi.has(x));
  if (!daScrivere.length) torna("no", "Le sezioni indicate non esistono più: ricarica la pagina.");

  await prisma.$transaction(
    daScrivere.map((id, i) => prisma.sezioneCategoria.update({ where: { id }, data: { ordine: i } })),
  );
  revalidatePath("/sezioni");
  revalidatePath("/prodotti");
  torna("ok", `Ordine salvato: ${daScrivere.length} sezioni.`);
}

/** Accende o spegne una sezione. Spenta = non si scrive più sulle schede nuove. */
export async function cambiaAttivaSezioneAzione(fd: FormData) {
  const id = testo(fd, "id");
  const s = await prisma.sezioneCategoria.findUnique({ where: { id }, select: { attiva: true, nome: true } });
  if (!s) torna("no", "Quella sezione non c'è più.");
  await prisma.sezioneCategoria.update({ where: { id }, data: { attiva: !s.attiva } });
  revalidatePath("/sezioni");
  torna("ok", `«${s.nome}» ora è ${s.attiva ? "spenta" : "accesa"}.`);
}

/** Cambia il tipo di compilazione: testo, elenco, coppie. */
export async function cambiaTipoSezioneAzione(fd: FormData) {
  const id = testo(fd, "id");
  const tipo = testo(fd, "tipo");
  if (!["testo", "elenco", "coppie"].includes(tipo)) torna("no", "Tipo non valido.");
  const s = await prisma.sezioneCategoria.findUnique({ where: { id }, select: { nome: true } });
  if (!s) torna("no", "Quella sezione non c'è più.");
  await prisma.sezioneCategoria.update({ where: { id }, data: { tipo } });
  revalidatePath("/sezioni");
  torna("ok", `«${s.nome}»: ora si compila come «${tipo}».`);
}

/** Aggiunge una sezione a una categoria, per tutti i siti o per uno solo. */
export async function aggiungiSezioneAzione(fd: FormData) {
  const categoria = testo(fd, "categoria");
  const nome = testo(fd, "nome").slice(0, 80);
  const negozio = testo(fd, "negozio") || null;
  const tipo = testo(fd, "tipo") || "testo";
  if (!categoria) torna("no", "Scegli la categoria.");
  if (!nome) torna("no", "Il nome della sezione è obbligatorio: è il titolo della tab sul sito.");
  if (!["testo", "elenco", "coppie"].includes(tipo)) torna("no", "Tipo non valido.");

  const gia = await prisma.sezioneCategoria.findFirst({ where: { categoria, negozio, nome } });
  if (gia) {
    if (gia.attiva) torna("no", `«${nome}» c'è già per questa categoria.`);
    await prisma.sezioneCategoria.update({ where: { id: gia.id }, data: { attiva: true } });
    revalidatePath("/sezioni");
    torna("ok", `«${nome}» era spenta: l'ho riaccesa.`);
  }
  // In fondo: una sezione nuova non scavalca quelle che il cliente già vede.
  const ultima = await prisma.sezioneCategoria.findFirst({
    where: { categoria, negozio },
    orderBy: { ordine: "desc" },
    select: { ordine: true },
  });
  await prisma.sezioneCategoria.create({
    data: { categoria, negozio, nome, tipo, richiesta: false, ordine: (ultima?.ordine ?? -1) + 1, attiva: true },
  });
  revalidatePath("/sezioni");
  torna("ok", `«${nome}» aggiunta${negozio ? ` per ${negozio}` : " per tutti i siti"}.`);
}

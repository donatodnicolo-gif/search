"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { conti, leggiScelti, righeDaScelti } from "./composti";
import { prisma } from "./db";

// Creare un prodotto composto e cambiarne i pezzi.
//
// Il costo e il prezzo dei componenti non vengono copiati sul composto: restano
// dove sono. Qui si salva **solo la ricetta** — quali prodotti e quanti — e i
// conti si rifanno ogni volta che si guarda. È l'unico modo perché restino veri.

function testo(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}

function soldi(fd: FormData, k: string): number {
  const n = Number(testo(fd, k).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function aggiorna() {
  for (const p of ["/multi-prodotto", "/prodotti", "/anagrafica", "/costi"]) revalidatePath(p);
}

/** Codice automatico dal nome, con un suffisso se è già preso. */
async function codiceLibero(nome: string): Promise<string> {
  const base =
    nome
      .toUpperCase()
      .normalize("NFD")
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "COMPOSTO";
  for (let i = 0; i < 50; i++) {
    const tentativo = i === 0 ? base : `${base}-${i + 1}`;
    const esiste = await prisma.prodotto.findUnique({ where: { codice: tentativo }, select: { id: true } });
    if (!esiste) return tentativo;
  }
  return `${base}-${Date.now()}`;
}

export async function creaCompostoAzione(fd: FormData) {
  const nome = testo(fd, "nome");
  const scelti = leggiScelti(testo(fd, "scelti"));
  const torna = (errore: string) =>
    redirect(`/multi-prodotto?scelti=${encodeURIComponent(testo(fd, "scelti"))}&errore=${encodeURIComponent(errore)}`);

  if (!nome) torna("Serve il nome del prodotto nuovo.");
  if (scelti.length < 2) torna("Un prodotto composto ha almeno due componenti: altrimenti è il prodotto stesso.");

  const righe = await righeDaScelti(scelti);
  if (righe.length !== scelti.length) torna("Uno dei componenti scelti non esiste più.");
  const c = conti(righe);

  const codice = testo(fd, "codice") || (await codiceLibero(nome));
  const esiste = await prisma.prodotto.findUnique({ where: { codice }, select: { id: true } });
  if (esiste) torna(`Il codice «${codice}» è già di un altro prodotto.`);

  // Il prezzo lo decide una persona. Se non lo scrive, si parte dalla somma dei
  // listini — ma solo quando i listini ci sono tutti: partire da una somma
  // incompleta vorrebbe dire proporre un prezzo più basso del dovuto senza
  // dirlo. Il costo invece non si scrive mai: si legge dai componenti.
  const prezzo = soldi(fd, "prezzoVendita") || (c.listiniCompleti ? c.sommaListini : 0);

  const creato = await prisma.prodotto.create({
    data: {
      nome,
      codice,
      categoria: testo(fd, "categoria") || "DA_CLASSIFICARE",
      descrizione: testo(fd, "descrizione") || null,
      prezzoVendita: prezzo,
      fase: "concept",
      componenti: {
        create: righe.map((r) => ({ componenteId: r.componente.id, quantita: r.quantita })),
      },
    },
    select: { id: true },
  });

  aggiorna();
  redirect(`/prodotti/${creato.id}?esito=` + encodeURIComponent(`«${nome}» creato con ${righe.length} componenti.`));
}

export async function cambiaComponenteAzione(compostoId: string, componenteId: string, fd: FormData) {
  const q = parseInt(testo(fd, "quantita"), 10);
  if (Number.isFinite(q) && q > 0) {
    await prisma.componenteProdotto.update({
      where: { compostoId_componenteId: { compostoId, componenteId } },
      data: { quantita: Math.min(999, q) },
    });
  } else {
    // Quantità zero = togliere il pezzo dalla ricetta. Non tocca il prodotto
    // componente, che resta in catalogo per conto suo.
    await prisma.componenteProdotto.deleteMany({ where: { compostoId, componenteId } });
  }
  aggiorna();
  revalidatePath(`/prodotti/${compostoId}`);
  redirect(`/prodotti/${compostoId}?tab=composizione`);
}

export async function aggiungiComponenteAzione(compostoId: string, fd: FormData) {
  const componenteId = testo(fd, "componenteId");
  if (!componenteId || componenteId === compostoId) redirect(`/prodotti/${compostoId}?tab=composizione`);
  const q = Math.max(1, Math.min(999, parseInt(testo(fd, "quantita"), 10) || 1));
  await prisma.componenteProdotto.upsert({
    where: { compostoId_componenteId: { compostoId, componenteId } },
    create: { compostoId, componenteId, quantita: q },
    update: { quantita: q },
  });
  aggiorna();
  revalidatePath(`/prodotti/${compostoId}`);
  redirect(`/prodotti/${compostoId}?tab=composizione`);
}

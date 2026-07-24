"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";

// Helper: legge una stringa non vuota dal form
function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}
function num(fd: FormData, k: string): number {
  const v = fd.get(k);
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : 0;
}
function intero(fd: FormData, k: string): number {
  const v = fd.get(k);
  const n = typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : 0;
}

// ---------- Collezioni ----------
export async function creaCollezione(fd: FormData) {
  const nome = str(fd, "nome");
  const stagione = str(fd, "stagione");
  if (!nome || !stagione) return;
  const c = await prisma.collezione.create({
    data: {
      nome,
      stagione,
      anno: intero(fd, "anno") || new Date().getFullYear(),
      tema: str(fd, "tema"),
      descrizione: str(fd, "descrizione"),
      stato: str(fd, "stato") ?? "in_sviluppo",
      margineTarget: str(fd, "margineTarget") ? num(fd, "margineTarget") : null,
    },
  });
  revalidatePath("/");
  redirect(`/collezioni/${c.id}`);
}

export async function cambiaStatoCollezione(id: string, stato: string) {
  await prisma.collezione.update({ where: { id }, data: { stato } });
  revalidatePath("/");
  revalidatePath(`/collezioni/${id}`);
}

// ---------- Prodotti ----------
export async function creaProdotto(fd: FormData) {
  const nome = str(fd, "nome");
  if (!nome) return;
  let codice = str(fd, "codice");
  if (!codice) codice = `MERCH-${Date.now().toString(36).toUpperCase()}`;
  // Evita collisioni di codice
  const esiste = await prisma.prodotto.findUnique({ where: { codice } });
  if (esiste) codice = `${codice}-${Math.floor(Math.random() * 900 + 100)}`;

  const p = await prisma.prodotto.create({
    data: {
      codice,
      nome,
      collezioneId: str(fd, "collezioneId"),
      categoria: str(fd, "categoria") ?? "BOUQUET",
      fase: str(fd, "fase") ?? "concept",
      brief: str(fd, "brief"),
      materiali: str(fd, "materiali"),
      palette: str(fd, "palette"),
      descrizione: str(fd, "descrizione"),
      costoProduzione: num(fd, "costoProduzione"),
      prezzoVendita: num(fd, "prezzoVendita"),
      immagine: str(fd, "immagine"),
    },
  });
  await prisma.tappaSviluppo.create({
    data: { prodottoId: p.id, da: "—", a: p.fase, nota: "Prodotto creato", origine: "ui" },
  });
  revalidatePath("/prodotti");
  revalidatePath("/");
  redirect(`/prodotti/${p.id}`);
}

// Aggiornamento generale (anagrafica + PLM + costi + visual) dalla scheda.
export async function aggiornaProdotto(id: string, fd: FormData) {
  await prisma.prodotto.update({
    where: { id },
    data: {
      nome: str(fd, "nome") ?? undefined,
      collezioneId: fd.has("collezioneId") ? str(fd, "collezioneId") : undefined,
      categoria: str(fd, "categoria") ?? undefined,
      descrizione: fd.has("descrizione") ? str(fd, "descrizione") : undefined,
      brief: fd.has("brief") ? str(fd, "brief") : undefined,
      materiali: fd.has("materiali") ? str(fd, "materiali") : undefined,
      palette: fd.has("palette") ? str(fd, "palette") : undefined,
      noteSviluppo: fd.has("noteSviluppo") ? str(fd, "noteSviluppo") : undefined,
      costoProduzione: fd.has("costoProduzione") ? num(fd, "costoProduzione") : undefined,
      prezzoVendita: fd.has("prezzoVendita") ? num(fd, "prezzoVendita") : undefined,
      immagine: fd.has("immagine") ? str(fd, "immagine") : undefined,
      priorita: fd.has("priorita") ? intero(fd, "priorita") : undefined,
    },
  });
  revalidatePath(`/prodotti/${id}`);
  revalidatePath("/prodotti");
  revalidatePath("/costi");
}

export async function cambiaFase(id: string, nuovaFase: string) {
  const p = await prisma.prodotto.findUnique({ where: { id } });
  if (!p || p.fase === nuovaFase) return;
  await prisma.$transaction([
    prisma.prodotto.update({ where: { id }, data: { fase: nuovaFase } }),
    prisma.tappaSviluppo.create({ data: { prodottoId: id, da: p.fase, a: nuovaFase, origine: "ui" } }),
  ]);
  revalidatePath(`/prodotti/${id}`);
  revalidatePath("/sviluppo");
  revalidatePath("/prodotti");
}

// ---------- Varianti ----------
export async function aggiungiVariante(prodottoId: string, fd: FormData) {
  const nome = str(fd, "nome");
  if (!nome) return;
  await prisma.variante.create({
    data: {
      prodottoId,
      nome,
      sku: str(fd, "sku"),
      deltaCosto: num(fd, "deltaCosto"),
      deltaPrezzo: num(fd, "deltaPrezzo"),
      giacenza: intero(fd, "giacenza"),
    },
  });
  revalidatePath(`/prodotti/${prodottoId}`);
}

export async function eliminaVariante(id: string, prodottoId: string) {
  await prisma.variante.delete({ where: { id } });
  revalidatePath(`/prodotti/${prodottoId}`);
}

// ---------- Vetrine (visual merchandising) ----------
export async function creaVetrina(fd: FormData) {
  const nome = str(fd, "nome");
  if (!nome) return;
  const v = await prisma.vetrina.create({
    data: {
      nome,
      stagione: str(fd, "stagione"),
      tipo: str(fd, "tipo") ?? "vetrina",
      descrizione: str(fd, "descrizione"),
    },
  });
  revalidatePath("/visual");
  redirect(`/visual/${v.id}`);
}

export async function aggiungiAVetrina(vetrinaId: string, prodottoId: string) {
  if (!prodottoId) return;
  const gia = await prisma.vetrinaProdotto.findUnique({
    where: { vetrinaId_prodottoId: { vetrinaId, prodottoId } },
  });
  if (gia) return;
  const max = await prisma.vetrinaProdotto.aggregate({ where: { vetrinaId }, _max: { posizione: true } });
  await prisma.vetrinaProdotto.create({
    data: { vetrinaId, prodottoId, posizione: (max._max.posizione ?? -1) + 1 },
  });
  revalidatePath(`/visual/${vetrinaId}`);
}

export async function rimuoviDaVetrina(voceId: string, vetrinaId: string) {
  await prisma.vetrinaProdotto.delete({ where: { id: voceId } });
  revalidatePath(`/visual/${vetrinaId}`);
}

// Sposta una voce su/giù scambiando la posizione con la vicina.
export async function spostaInVetrina(voceId: string, vetrinaId: string, direzione: "su" | "giu") {
  const voci = await prisma.vetrinaProdotto.findMany({
    where: { vetrinaId },
    orderBy: { posizione: "asc" },
  });
  const i = voci.findIndex((v) => v.id === voceId);
  if (i === -1) return;
  const j = direzione === "su" ? i - 1 : i + 1;
  if (j < 0 || j >= voci.length) return;
  await prisma.$transaction([
    prisma.vetrinaProdotto.update({ where: { id: voci[i].id }, data: { posizione: voci[j].posizione } }),
    prisma.vetrinaProdotto.update({ where: { id: voci[j].id }, data: { posizione: voci[i].posizione } }),
  ]);
  revalidatePath(`/visual/${vetrinaId}`);
}

// ---------- Shopify (canale a valle) ----------
// Segna lo stato di pubblicazione. La scrittura reale sul negozio richiede le
// credenziali (SHOPIFY_STORE_DOMAIN + SHOPIFY_ADMIN_TOKEN) e va confermata:
// qui si registra l'intento e il timestamp, così la pipeline è pronta.
export async function segnaShopify(id: string, stato: string) {
  await prisma.prodotto.update({
    where: { id },
    data: {
      shopifyStato: stato,
      shopifySyncIl: stato === "non_pubblicato" ? null : new Date(),
    },
  });
  revalidatePath("/shopify");
  revalidatePath(`/prodotti/${id}`);
}

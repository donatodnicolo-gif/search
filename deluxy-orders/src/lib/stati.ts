import { prisma } from "./db";
import type { StatoOrdine } from "@prisma/client";

// Pipeline di partenza: la prima volta che serve uno stato (import o apertura
// della Bacheca) si creano questi passaggi predefiniti. Restano modificabili in
// Impostazioni: nome, colore, ordine e quali sono "predefinito"/"terminale".
const STATI_INIZIALI: Array<{
  chiave: string;
  nome: string;
  colore: string;
  ordine: number;
  predefinito?: boolean;
  terminale?: boolean;
}> = [
  { chiave: "nuovo", nome: "Nuovo", colore: "#0071e3", ordine: 0, predefinito: true },
  { chiave: "da_smistare", nome: "Da smistare", colore: "#c93400", ordine: 1 },
  { chiave: "assegnato", nome: "Assegnato", colore: "#b8963e", ordine: 2 },
  { chiave: "in_consegna", nome: "In consegna", colore: "#6d3fc4", ordine: 3 },
  { chiave: "consegnato", nome: "Consegnato", colore: "#248a3d", ordine: 4, terminale: true },
  { chiave: "annullato", nome: "Annullato", colore: "#86868b", ordine: 5, terminale: true },
];

// Crea gli stati predefiniti se non ce n'è nessuno. Idempotente.
export async function assicuraStatiPredefiniti(): Promise<void> {
  const quanti = await prisma.statoOrdine.count();
  if (quanti > 0) return;
  await prisma.statoOrdine.createMany({ data: STATI_INIZIALI });
}

// Tutti gli stati in ordine di pipeline (assicurando prima i predefiniti).
export async function statiOrdinati(): Promise<StatoOrdine[]> {
  await assicuraStatiPredefiniti();
  return prisma.statoOrdine.findMany({ orderBy: [{ ordine: "asc" }, { createdAt: "asc" }] });
}

// Lo stato iniziale dei nuovi ordini (il "predefinito", o il primo della lista).
export async function statoPredefinito(): Promise<StatoOrdine | null> {
  await assicuraStatiPredefiniti();
  return (
    (await prisma.statoOrdine.findFirst({ where: { predefinito: true }, orderBy: { ordine: "asc" } })) ??
    (await prisma.statoOrdine.findFirst({ orderBy: { ordine: "asc" } }))
  );
}

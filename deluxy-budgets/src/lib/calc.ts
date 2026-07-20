// Motore di calcolo: scenari su 3 livelli e P&L.
// Tutto ciò che è derivato (livelli sfidante/irraggiungibile, margini,
// risultato operativo, ADV consentito) si calcola qui a partire dal budget
// pubblicato salvato a DB — mai memorizzato a mano.
import { prisma } from "./db";

export const ANNO_CORRENTE = 2026;

export type Livello = "RAGGIUNGIBILE" | "SFIDANTE" | "IRRAGGIUNGIBILE";

export const LIVELLI: { key: Livello; label: string; badge: string }[] = [
  { key: "RAGGIUNGIBILE", label: "Raggiungibile", badge: "green" },
  { key: "SFIDANTE", label: "Sfidante", badge: "gold" },
  { key: "IRRAGGIUNGIBILE", label: "Irraggiungibile", badge: "purple" },
];

export const CANALI = ["D2C", "EVENTI", "B2B"] as const;
export type Canale = (typeof CANALI)[number];

export type MaisonBudget = {
  id: string;
  slug: string;
  nome: string;
  ordine: number;
  // vendite pubblicate per mese (1..12) e canale
  mesi: { month: number; d2c: number; eventi: number; b2b: number; advPercent: number; advPubblicato: number }[];
};

export type DatiAnno = {
  year: number;
  maisons: MaisonBudget[];
  scenari: { livello: Livello; moltiplicatore: number; premio: number; note: string | null }[];
  costi: { id: string; tipo: string; label: string; valore: number; maisonId: string | null }[];
};

export async function caricaAnno(year = ANNO_CORRENTE): Promise<DatiAnno> {
  const [maisons, entries, advs, scenari, costi] = await Promise.all([
    prisma.maison.findMany({ orderBy: { ordine: "asc" } }),
    prisma.budgetEntry.findMany({ where: { year } }),
    prisma.advPercent.findMany({ where: { year } }),
    prisma.scenarioConfig.findMany({ where: { year } }),
    prisma.costConfig.findMany({ where: { year } }),
  ]);

  const out: MaisonBudget[] = maisons.map((m) => {
    const mesi = [];
    for (let month = 1; month <= 12; month++) {
      const get = (canale: string) =>
        entries.find((e) => e.maisonId === m.id && e.month === month && e.canale === canale)?.vendite ?? 0;
      const adv = advs.find((a) => a.maisonId === m.id && a.month === month);
      mesi.push({
        month,
        d2c: get("D2C"),
        eventi: get("EVENTI"),
        b2b: get("B2B"),
        advPercent: adv?.percent ?? 0,
        advPubblicato: adv?.budgetPubblicato ?? 0,
      });
    }
    return { id: m.id, slug: m.slug, nome: m.nome, ordine: m.ordine, mesi };
  });

  return {
    year,
    maisons: out,
    scenari: scenari.map((s) => ({
      livello: s.livello as Livello,
      moltiplicatore: s.moltiplicatore,
      premio: s.premio,
      note: s.note,
    })),
    costi,
  };
}

export function moltiplicatore(dati: DatiAnno, livello: Livello): number {
  return dati.scenari.find((s) => s.livello === livello)?.moltiplicatore ?? 1;
}

export function premio(dati: DatiAnno, livello: Livello): number {
  return dati.scenari.find((s) => s.livello === livello)?.premio ?? 0;
}

export function totaliMaison(m: MaisonBudget) {
  const d2c = m.mesi.reduce((s, x) => s + x.d2c, 0);
  const eventi = m.mesi.reduce((s, x) => s + x.eventi, 0);
  const b2b = m.mesi.reduce((s, x) => s + x.b2b, 0);
  const adv = m.mesi.reduce((s, x) => s + advConsentitoMese(x), 0);
  const advPubblicato = m.mesi.reduce((s, x) => s + x.advPubblicato, 0);
  return { d2c, eventi, b2b, totale: d2c + eventi + b2b, adv, advPubblicato };
}

// ADV consentito nel mese = vendite del mese × % impostata in /spese.
export function advConsentitoMese(mese: MaisonBudget["mesi"][number]): number {
  const vendite = mese.d2c + mese.eventi + mese.b2b;
  return (vendite * mese.advPercent) / 100;
}

export type PL = {
  livello: Livello;
  moltiplicatore: number;
  ricavi: number;
  cogs: number;
  margineLordo: number;
  adv: number;
  costiFissi: number;
  risultatoOperativo: number;
  premio: number;
  risultatoDopoPremi: number;
  rosPct: number; // risultato operativo / ricavi
};

// P&L dell'anno per un livello di scenario. Le vendite e l'ADV scalano con il
// moltiplicatore; i costi fissi no.
export function contoEconomico(dati: DatiAnno, livello: Livello, maisonSlug?: string): PL {
  const molt = moltiplicatore(dati, livello);
  const maisons = maisonSlug ? dati.maisons.filter((m) => m.slug === maisonSlug) : dati.maisons;

  const venditeBase = maisons.reduce((s, m) => s + totaliMaison(m).totale, 0);
  const advBase = maisons.reduce((s, m) => s + totaliMaison(m).adv, 0);

  const cogsPct = dati.costi
    .filter((c) => c.tipo === "COGS_PCT" && (c.maisonId === null || maisons.some((m) => m.id === c.maisonId)))
    .reduce((s, c) => s + c.valore, 0);
  const fissiMensili = dati.costi
    .filter((c) => c.tipo === "FISSO_MENSILE" && c.maisonId === null)
    .reduce((s, c) => s + c.valore, 0);
  const fissiAnnui = dati.costi
    .filter((c) => c.tipo === "FISSO_ANNUO" && c.maisonId === null)
    .reduce((s, c) => s + c.valore, 0);

  const ricavi = venditeBase * molt;
  const cogs = (ricavi * cogsPct) / 100;
  const margineLordo = ricavi - cogs;
  const adv = advBase * molt;
  // I costi fissi globali si imputano al P&L globale; nel P&L di una singola
  // maison si ripartiscono in proporzione ai ricavi.
  const quota = maisonSlug
    ? venditeBase / Math.max(1, dati.maisons.reduce((s, m) => s + totaliMaison(m).totale, 0))
    : 1;
  const costiFissi = (fissiMensili * 12 + fissiAnnui) * quota;
  const risultatoOperativo = margineLordo - adv - costiFissi;
  const p = premio(dati, livello) * quota;

  return {
    livello,
    moltiplicatore: molt,
    ricavi,
    cogs,
    margineLordo,
    adv,
    costiFissi,
    risultatoOperativo,
    premio: p,
    risultatoDopoPremi: risultatoOperativo - p,
    rosPct: ricavi > 0 ? (risultatoOperativo / ricavi) * 100 : 0,
  };
}

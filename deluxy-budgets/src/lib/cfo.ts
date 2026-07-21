// CFO — riclassificazione degli addebiti bancari in categorie di costo.
// Le categorie e le regole vivono a DB (CategoriaCosto, RegolaCosto); questo
// modulo applica le regole alle controparti che arrivano da Finance e
// ricostruisce i costi per categoria e per mese.
import { prisma } from "./db";
import type { SpesaControparte } from "./finance";

export const TIPI_PL = [
  { key: "COGS", label: "Costo del venduto", badge: "orange" },
  { key: "ADV", label: "Pubblicità", badge: "blue" },
  { key: "PERSONALE", label: "Personale", badge: "purple" },
  { key: "STRUTTURA", label: "Struttura", badge: "neutral" },
  { key: "ESCLUSA", label: "Esclusa dal P&L", badge: "gold" },
] as const;

export type Categoria = {
  id: string;
  nome: string;
  tipoPL: string;
  colore: string | null;
  ordine: number;
  regole: { id: string; match: string; esatto: boolean }[];
};

export async function caricaCategorie(): Promise<Categoria[]> {
  const cats = await prisma.categoriaCosto.findMany({
    orderBy: [{ ordine: "asc" }, { nome: "asc" }],
    include: { regole: true },
  });
  return cats.map((c) => ({
    id: c.id,
    nome: c.nome,
    tipoPL: c.tipoPL,
    colore: c.colore,
    ordine: c.ordine,
    regole: c.regole.map((r) => ({ id: r.id, match: r.match, esatto: r.esatto })),
  }));
}

// Trova la categoria di una controparte. Vince la regola col match più lungo
// (più specifico); a parità, l'uguaglianza batte il "contiene".
export function categoriaDi(controparte: string, categorie: Categoria[]): Categoria | null {
  const c = controparte.toLowerCase();
  let migliore: { cat: Categoria; peso: number } | null = null;
  for (const cat of categorie) {
    for (const r of cat.regole) {
      const m = r.match.trim().toLowerCase();
      if (!m) continue;
      const ok = r.esatto ? c === m : c.includes(m);
      if (!ok) continue;
      const peso = m.length + (r.esatto ? 1000 : 0);
      if (!migliore || peso > migliore.peso) migliore = { cat, peso };
    }
  }
  return migliore?.cat ?? null;
}

export type RigaCategoria = {
  categoria: Categoria | null; // null = non categorizzata
  uscite: number;
  movimenti: number;
  perMese: number[];
  controparti: { controparte: string; uscite: number }[];
};

// Raggruppa gli addebiti per categoria applicando le regole.
export function ricostruisci(controparti: SpesaControparte[], categorie: Categoria[]): RigaCategoria[] {
  const perCat = new Map<string, RigaCategoria>();
  const chiave = (c: Categoria | null) => c?.id ?? "__none__";

  for (const s of controparti) {
    const cat = categoriaDi(s.controparte, categorie);
    const k = chiave(cat);
    const r: RigaCategoria =
      perCat.get(k) ??
      { categoria: cat, uscite: 0, movimenti: 0, perMese: Array(12).fill(0), controparti: [] };
    r.uscite += s.uscite;
    r.movimenti += s.movimenti;
    for (let i = 0; i < 12; i++) r.perMese[i] += s.perMese[i] ?? 0;
    r.controparti.push({ controparte: s.controparte, uscite: s.uscite });
    perCat.set(k, r);
  }

  // controparti dalla più costosa; categorie per ordine configurato, non
  // categorizzate in fondo
  for (const r of perCat.values()) r.controparti.sort((a, b) => b.uscite - a.uscite);
  return [...perCat.values()].sort((a, b) => {
    if (!a.categoria) return 1;
    if (!b.categoria) return -1;
    return a.categoria.ordine - b.categoria.ordine || b.uscite - a.uscite;
  });
}

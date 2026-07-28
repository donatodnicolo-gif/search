import { prisma } from "./db";
import {
  CAMPI_PER_GRUPPO,
  vocabolario,
  voceDi,
  type ChiaveRaggruppamento,
  type Voce,
} from "./gruppi";
import { FILTRO_BUON_FINE, finestra } from "./vendite";

// La **griglia**: il catalogo incrociato su due lenti insieme — per esempio
// fornitore per fascia di prezzo, o categoria per fascia.
//
// Serve a una domanda che un elenco non sa rispondere: *dove il numero di
// referenze e il venduto non vanno d'accordo?* Una casella che tiene il 20%
// degli SKU e fa il 4% del venduto è assortimento fermo; una che tiene il 5%
// degli SKU e fa il 25% del venduto è una casella da riempire. Per questo la
// griglia mostra sempre **le due quote insieme**, non una alla volta: è dal loro
// scarto che si decide.

export type Cella = {
  sku: number;
  esclusi: number;
  ricavo: number;
  quantita: number;
};

export type Griglia = {
  righe: Voce[];
  colonne: Voce[];
  /** chiave = `${riga.chiave}||${colonna.chiave}` */
  celle: Map<string, Cella>;
  perRiga: Map<string, Cella>;
  perColonna: Map<string, Cella>;
  totale: Cella;
};

const vuota = (): Cella => ({ sku: 0, esclusi: 0, ricavo: 0, quantita: 0 });

// I modi di mettere in fila righe e colonne. «Naturale» è l'ordine proprio
// della lente: per le fasce di prezzo è la scala dei prezzi — che messa in
// ordine alfabetico o di fatturato smette di essere una scala.
export const ORDINI_MATRICE = [
  { chiave: "naturale", nome: "ordine naturale" },
  { chiave: "venduto-desc", nome: "venduto ↓" },
  { chiave: "venduto-asc", nome: "venduto ↑" },
  { chiave: "sku-desc", nome: "SKU ↓" },
  { chiave: "sku-asc", nome: "SKU ↑" },
  { chiave: "pezzi-desc", nome: "pezzi ↓" },
  { chiave: "pezzi-asc", nome: "pezzi ↑" },
  { chiave: "nome-asc", nome: "nome A–Z" },
  { chiave: "nome-desc", nome: "nome Z–A" },
] as const;

export function ordinaVoci(voci: Map<string, Voce>, totali: Map<string, Cella>, ordine: string): Voce[] {
  const lista = [...voci.values()];
  const [criterio, verso] = ordine.split("-");
  const giu = verso !== "asc";
  const val = (v: Voce) => {
    const c = totali.get(v.chiave);
    if (criterio === "sku") return c?.sku ?? 0;
    if (criterio === "pezzi") return c?.quantita ?? 0;
    return c?.ricavo ?? 0;
  };
  if (criterio === "naturale") {
    // A parità di posto naturale (le lenti che non ne hanno una) si ricade sul
    // venduto: meglio del disordine con cui i prodotti escono dal database.
    return lista.sort((a, b) => a.ordine - b.ordine || val(b) - val(a));
  }
  if (criterio === "nome") {
    return lista.sort((a, b) => (giu ? -1 : 1) * a.etichetta.localeCompare(b.etichetta, "it"));
  }
  return lista.sort((a, b) => (giu ? val(b) - val(a) : val(a) - val(b)) || a.etichetta.localeCompare(b.etichetta, "it"));
}

function somma(c: Cella, sku: number, esclusi: number, ricavo: number, quantita: number) {
  c.sku += sku;
  c.esclusi += esclusi;
  c.ricavo += ricavo;
  c.quantita += quantita;
}

/**
 * Conta gli SKU e il venduto di ogni incrocio.
 *
 * «SKU» qui è il numero di **prodotti** che cadono nella casella: è il conto che
 * si confronta col venduto quando si guarda l'ampiezza dell'assortimento. Come
 * ovunque nell'app, il venduto somma solo i prodotti dentro le analisi e gli
 * esclusi restano contati a parte.
 */
export async function calcolaGriglia({
  where,
  brand,
  righe,
  colonne,
  ordineRighe = "venduto-desc",
  ordineColonne = "naturale",
  giorni = 90,
}: {
  where: Record<string, unknown>;
  brand: string | null;
  righe: ChiaveRaggruppamento;
  colonne: ChiaveRaggruppamento;
  ordineRighe?: string;
  ordineColonne?: string;
  giorni?: number;
}): Promise<Griglia> {
  const f = finestra(giorni);
  const [prodotti, vendite, voc] = await Promise.all([
    prisma.prodotto.findMany({ where, select: CAMPI_PER_GRUPPO }),
    prisma.vendita.groupBy({
      by: ["prodottoId"],
      where: { data: { gte: f.dal, lte: f.al }, ...FILTRO_BUON_FINE, ...(brand ? { canale: brand } : {}) },
      _sum: { quantita: true, ricavo: true },
    }),
    vocabolario(),
  ]);
  const venduto = new Map(vendite.map((v) => [v.prodottoId as string, v]));

  const vociRiga = new Map<string, Voce>();
  const vociColonna = new Map<string, Voce>();
  const celle = new Map<string, Cella>();
  const perRiga = new Map<string, Cella>();
  const perColonna = new Map<string, Cella>();
  const totale = vuota();

  for (const p of prodotti) {
    const r = voceDi(p, righe, voc);
    const c = voceDi(p, colonne, voc);
    if (!vociRiga.has(r.chiave)) vociRiga.set(r.chiave, r);
    if (!vociColonna.has(c.chiave)) vociColonna.set(c.chiave, c);

    const escluso = p.esclusoDaAnalisi;
    const v = escluso ? null : venduto.get(p.id);
    const sku = escluso ? 0 : 1;
    const esclusi = escluso ? 1 : 0;
    const ricavo = v?._sum.ricavo ?? 0;
    const quantita = v?._sum.quantita ?? 0;

    const k = `${r.chiave}||${c.chiave}`;
    if (!celle.has(k)) celle.set(k, vuota());
    if (!perRiga.has(r.chiave)) perRiga.set(r.chiave, vuota());
    if (!perColonna.has(c.chiave)) perColonna.set(c.chiave, vuota());
    somma(celle.get(k)!, sku, esclusi, ricavo, quantita);
    somma(perRiga.get(r.chiave)!, sku, esclusi, ricavo, quantita);
    somma(perColonna.get(c.chiave)!, sku, esclusi, ricavo, quantita);
    somma(totale, sku, esclusi, ricavo, quantita);
  }

  return {
    righe: ordinaVoci(vociRiga, perRiga, ordineRighe),
    colonne: ordinaVoci(vociColonna, perColonna, ordineColonne),
    celle,
    perRiga,
    perColonna,
    totale,
  };
}

/**
 * Lo **scarto** fra la quota di venduto e la quota di SKU di una casella, in
 * punti percentuali. Positivo = rende più di quanto occupa; negativo = occupa
 * più di quanto rende. Vale `null` quando la casella è vuota: zero su zero non è
 * «in pari», è niente da dire.
 */
export function scarto(c: Cella, totale: Cella): number | null {
  if (c.sku === 0 && c.ricavo === 0) return null;
  if (totale.sku === 0 || totale.ricavo === 0) return null;
  return (c.ricavo / totale.ricavo) * 100 - (c.sku / totale.sku) * 100;
}

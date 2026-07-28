import { elencoCategorie, elencoLinee } from "./classificazione";
import { prisma } from "./db";
import { FILTRO_BUON_FINE, finestra } from "./vendite";

// Il catalogo visto **per insieme** invece che prodotto per prodotto: quanto
// pesa un fornitore, quanto una categoria. È lo stesso calcolo che serve in
// /anagrafica (menu «raggruppa per»), in /fornitori e in /categorie: sta qui una
// volta sola, così le tre pagine non possono dare tre numeri diversi.
//
// I quattro campi sono di natura diversa e vale la pena tenerli distinti:
// **fornitore** e **categoria dal negozio** sono letti da Shopify (Venditore e
// Tipo), **categoria interna** e **linea** le decidiamo noi in /classificazione.
export const RAGGRUPPAMENTI = [
  { chiave: "fornitore", nome: "Fornitore" },
  { chiave: "tipo", nome: "Categoria dal negozio" },
  { chiave: "categoria", nome: "Categoria interna" },
  { chiave: "linea", nome: "Linea" },
  { chiave: "fornitore-tipo", nome: "Fornitore e categoria" },
] as const;

export type ChiaveRaggruppamento = (typeof RAGGRUPPAMENTI)[number]["chiave"];

export function nomeRaggruppamento(chiave: string): string | undefined {
  return RAGGRUPPAMENTI.find((r) => r.chiave === chiave)?.nome;
}

export type Gruppo = {
  chiave: string;
  etichetta: string;
  sotto: string | null;
  /** I filtri da passare a /anagrafica per aprire i prodotti di questo gruppo. */
  filtro: Record<string, string>;
  prodotti: number;
  esclusi: number;
  senzaCosto: number;
  ricavo: number;
  quantita: number;
};

/**
 * I gruppi si calcolano su **tutti** i prodotti che passano il filtro, mai su
 * una pagina: un totale di fornitore che cambia sfogliando non sarebbe un
 * totale.
 *
 * Il venduto sommato è quello dei prodotti **dentro le analisi**: gli esclusi
 * restano contati come pezzi d'anagrafica (colonna «esclusi») ma non gonfiano il
 * fatturato del gruppo, altrimenti qui si leggerebbero numeri che nelle
 * classifiche non esistono.
 */
export async function calcolaGruppi({
  where,
  brand,
  per,
  ordina = "venduto",
  giorni = 90,
}: {
  where: Record<string, unknown>;
  brand: string | null;
  per: ChiaveRaggruppamento;
  ordina?: string;
  giorni?: number;
}): Promise<Gruppo[]> {
  const f = finestra(giorni);
  const [prodotti, vendite, categorie, linee] = await Promise.all([
    prisma.prodotto.findMany({
      where,
      select: {
        id: true,
        vendorShopify: true,
        tipoShopify: true,
        categoria: true,
        lineaId: true,
        costoProduzione: true,
        esclusoDaAnalisi: true,
      },
    }),
    prisma.vendita.groupBy({
      by: ["prodottoId"],
      where: { data: { gte: f.dal, lte: f.al }, ...FILTRO_BUON_FINE, ...(brand ? { canale: brand } : {}) },
      _sum: { quantita: true, ricavo: true },
    }),
    elencoCategorie(),
    elencoLinee(),
  ]);

  const venduto = new Map(vendite.map((v) => [v.prodottoId as string, v]));
  const nomeCategoria = new Map(categorie.map((c) => [c.chiave, c.nome]));
  const nomeLinea = new Map(linee.map((l) => [l.id, l.nome]));

  const mappa = new Map<string, Gruppo>();
  for (const p of prodotti) {
    let chiave: string;
    let etichetta: string;
    let sotto: string | null = null;
    const filtro: Record<string, string> = {};

    const vendor = p.vendorShopify;
    const tipo = p.tipoShopify;
    if (per === "fornitore" || per === "fornitore-tipo") {
      etichetta = vendor ?? "— senza fornitore —";
      if (vendor) filtro.fornitore = vendor;
      else filtro.manca = "fornitore";
    } else if (per === "tipo") {
      etichetta = tipo ?? "— senza categoria dal negozio —";
      if (tipo) filtro.tipo = tipo;
      else filtro.manca = "tipo";
    } else if (per === "categoria") {
      etichetta = nomeCategoria.get(p.categoria) ?? p.categoria;
      filtro.categoria = p.categoria;
    } else {
      etichetta = p.lineaId ? nomeLinea.get(p.lineaId) ?? "Linea sconosciuta" : "— senza linea —";
      if (p.lineaId) filtro.linea = p.lineaId;
      else filtro.manca = "linea";
    }

    if (per === "fornitore-tipo") {
      sotto = tipo ?? "— senza categoria dal negozio —";
      if (tipo) filtro.tipo = tipo;
      else if (!filtro.manca) filtro.manca = "tipo";
      chiave = `${vendor ?? ""}||${tipo ?? ""}`;
    } else {
      chiave = etichetta;
    }

    let g = mappa.get(chiave);
    if (!g) {
      g = { chiave, etichetta, sotto, filtro, prodotti: 0, esclusi: 0, senzaCosto: 0, ricavo: 0, quantita: 0 };
      mappa.set(chiave, g);
    }
    g.prodotti += 1;
    if (p.esclusoDaAnalisi) g.esclusi += 1;
    else {
      if (p.costoProduzione <= 0) g.senzaCosto += 1;
      const v = venduto.get(p.id);
      if (v) {
        g.ricavo += v._sum.ricavo ?? 0;
        g.quantita += v._sum.quantita ?? 0;
      }
    }
  }

  const gruppi = [...mappa.values()];
  gruppi.sort(
    ordina === "nome"
      ? (a, b) => `${a.etichetta} ${a.sotto ?? ""}`.localeCompare(`${b.etichetta} ${b.sotto ?? ""}`, "it")
      : ordina === "prodotti"
        ? (a, b) => b.prodotti - a.prodotti
        : ordina === "quantita"
          ? (a, b) => b.quantita - a.quantita
          : (a, b) => b.ricavo - a.ricavo,
  );
  return gruppi;
}

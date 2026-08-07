import { prisma } from "./db";
import { FILTRO_IN_SCENA } from "./ordinamento-vetrina";

const MAX_VALORI = 400;

export type VoceValore = { v: string; n: number | null; etichetta?: string };
export type VociPassi = {
  tipi: VoceValore[];
  categorie: VoceValore[];
  fornitori: VoceValore[];
  linee: VoceValore[];
  tag: VoceValore[];
};

/**
 * I valori che si possono mettere in una condizione, letti dai dati veri e col
 * **numero di prodotti che li portano**.
 *
 * **Contano solo i prodotti in vendita.** Prima si contava tutto il catalogo:
 * «Fiori 379» comprendeva archiviati e bozze, e spuntandolo l'anteprima ne
 * mostrava molti meno — il numero prometteva quello che la regola non poteva
 * mantenere. Una condizione serve a ordinare una vetrina, e in vetrina ci va
 * solo quello che il cliente vede.
 *
 * Per lo stesso motivo **i valori che nessun prodotto attivo porta non compaiono
 * affatto**: sceglierli non sposterebbe niente, e vederli fa perdere tempo.
 *
 * Sta in un posto solo perché le stesse voci servono alla pagina della regola
 * **e** alla scheda della collezione: con due copie le due pagine finirebbero
 * per offrire elenchi diversi.
 */
export async function vociPassi(): Promise<VociPassi> {
  const [categorie, linee, tipi, fornitori, tagGrezzi] = await Promise.all([
    prisma.prodotto.groupBy({ by: ["categoria"], where: FILTRO_IN_SCENA, _count: true }),
    prisma.prodotto.groupBy({ by: ["lineaId"], where: { ...FILTRO_IN_SCENA, lineaId: { not: null } }, _count: true }),
    prisma.prodotto.groupBy({ by: ["tipoShopify"], where: { ...FILTRO_IN_SCENA, tipoShopify: { not: null } }, _count: true }),
    prisma.prodotto.groupBy({ by: ["vendorShopify"], where: { ...FILTRO_IN_SCENA, vendorShopify: { not: null } }, _count: true }),
    prisma.prodotto.findMany({ where: { ...FILTRO_IN_SCENA, tagShopify: { not: null } }, select: { tagShopify: true } }),
  ]);

  // I nomi leggibili: la chiave salvata su `Prodotto.categoria` e l'id della
  // linea non si mostrano a nessuno.
  const [nomiCategoria, nomiLinea] = await Promise.all([
    prisma.categoriaProdotto.findMany({ select: { chiave: true, nome: true } }),
    prisma.lineaProdotto.findMany({ select: { id: true, nome: true } }),
  ]);
  const nomeCat = new Map(nomiCategoria.map((c) => [c.chiave, c.nome]));
  const nomeLin = new Map(nomiLinea.map((l) => [l.id, l.nome]));

  // I tag arrivano da Shopify in una stringa sola separata da virgole: si
  // contano uno per uno, perché è lì che vivono occasione e destinatario
  // (compleanno, matrimonio, per lei…).
  const conta = new Map<string, number>();
  for (const p of tagGrezzi) {
    for (const t of (p.tagShopify ?? "").split(",")) {
      const k = t.trim();
      if (k) conta.set(k, (conta.get(k) ?? 0) + 1);
    }
  }

  const perConta = <T extends { _count: number }>(righe: T[]) => [...righe].sort((a, b) => b._count - a._count);

  return {
    tipi: perConta(tipi).map((t) => ({ v: t.tipoShopify as string, n: t._count })),
    categorie: perConta(categorie).map((c) => ({
      v: c.categoria,
      n: c._count,
      etichetta: nomeCat.get(c.categoria) ?? c.categoria,
    })),
    fornitori: perConta(fornitori).map((f) => ({ v: f.vendorShopify as string, n: f._count })),
    linee: perConta(linee).map((l) => ({
      v: l.lineaId as string,
      n: l._count,
      etichetta: nomeLin.get(l.lineaId as string) ?? (l.lineaId as string),
    })),
    tag: [...conta.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_VALORI).map(([v, n]) => ({ v, n })),
  };
}

import { prisma } from "./db";
import { elencoCategorie } from "./classificazione";

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
 * **numero di prodotti che li portano** accanto.
 *
 * Una regola scritta su un valore che nessuno ha non sposta niente, ed è meglio
 * vederlo prima di salvarla che dopo. Sta in un posto solo perché le stesse voci
 * servono alla pagina della regola **e** alla scheda della collezione: con due
 * copie le due pagine finirebbero per offrire elenchi diversi.
 */
export async function vociPassi(): Promise<VociPassi> {
  const [categorie, linee, tipi, fornitori, tagGrezzi] = await Promise.all([
    elencoCategorie(),
    prisma.lineaProdotto.findMany({ where: { attiva: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.prodotto.groupBy({ by: ["tipoShopify"], where: { tipoShopify: { not: null } }, _count: true }),
    prisma.prodotto.groupBy({ by: ["vendorShopify"], where: { vendorShopify: { not: null } }, _count: true }),
    prisma.prodotto.findMany({ where: { tagShopify: { not: null } }, select: { tagShopify: true } }),
  ]);

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
    categorie: categorie.map((c) => ({ v: c.chiave, n: null, etichetta: c.nome })),
    fornitori: perConta(fornitori).map((f) => ({ v: f.vendorShopify as string, n: f._count })),
    linee: linee.map((l) => ({ v: l.id, n: null, etichetta: l.nome })),
    tag: [...conta.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_VALORI).map(([v, n]) => ({ v, n })),
  };
}

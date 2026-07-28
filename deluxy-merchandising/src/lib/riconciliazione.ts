import { prisma } from "./db";

// **Riconciliazione**: due schede che sono lo stesso prodotto.
//
// Succede perché i prodotti sono nati dai titoli del venduto, e lo stesso
// bouquet venduto su tre negozi arriva con tre titoli diversi («Bouquet Ora
// Blu», «BOUQUET ORA BLU», «Bouquet Ora Blu - Medium»). Finché restano tre
// schede, le classifiche dividono in tre il venduto di un prodotto solo.
//
// Qui non si indovina niente da soli: l'app **propone** gli accostamenti e dice
// perché, la persona sceglie. È la stessa regola dell'AI sulle descrizioni —
// propone, non applica.

/** Il nome ridotto all'osso, per confrontare titoli scritti in modi diversi. */
export function normalizza(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // via gli accenti staccati dalla normalizzazione
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type Candidato = {
  id: string;
  nome: string;
  codice: string;
  prezzoVendita: number;
  vendorShopify: string | null;
  tipoShopify: string | null;
  vendite: number;
  ricavo: number;
  /** Perché l'app lo propone: sta scritto in pagina, non è una scatola nera. */
  motivo: string;
};

type Riga = {
  id: string;
  nome: string;
  codice: string;
  prezzoVendita: number;
  vendorShopify: string | null;
  tipoShopify: string | null;
  handleShopify: string | null;
  varianti: { sku: string | null }[];
};

function statistiche(ids: string[]) {
  return prisma.vendita.groupBy({
    by: ["prodottoId"],
    where: { prodottoId: { in: ids } },
    _sum: { quantita: true, ricavo: true },
  });
}

/**
 * Le schede che potrebbero essere lo stesso prodotto di `id`. Tre motivi, dal
 * più forte al più debole: lo stesso SKU, lo stesso handle Shopify, lo stesso
 * nome ridotto all'osso. Chi è già stato unito a qualcuno non si ripropone.
 */
export async function candidati(id: string, cerca?: string): Promise<Candidato[]> {
  const base = await prisma.prodotto.findUnique({
    where: { id },
    select: { id: true, nome: true, handleShopify: true, varianti: { select: { sku: true } } },
  });
  if (!base) return [];

  const sku = base.varianti.map((v) => v.sku).filter((s): s is string => Boolean(s));
  const chiave = normalizza(base.nome);

  const filtri: Record<string, unknown>[] = [];
  if (sku.length > 0) filtri.push({ varianti: { some: { sku: { in: sku } } } });
  if (base.handleShopify) filtri.push({ handleShopify: base.handleShopify });
  // Il nome non si può confrontare normalizzato dentro il database: si prende un
  // insieme ragionevole (le prime parole) e si filtra qui.
  const prime = chiave.split(" ").slice(0, 3).join(" ");
  if (prime.length >= 4) filtri.push({ nome: { contains: prime, mode: "insensitive" } });
  if (cerca && cerca.trim().length >= 2) {
    filtri.push({ nome: { contains: cerca.trim(), mode: "insensitive" } });
    filtri.push({ codice: { contains: cerca.trim(), mode: "insensitive" } });
  }
  if (filtri.length === 0) return [];

  const trovati = (await prisma.prodotto.findMany({
    where: { id: { not: id }, unitoAId: null, OR: filtri },
    select: {
      id: true,
      nome: true,
      codice: true,
      prezzoVendita: true,
      vendorShopify: true,
      tipoShopify: true,
      handleShopify: true,
      varianti: { select: { sku: true } },
    },
    take: 60,
  })) as Riga[];

  const vendite = await statistiche(trovati.map((t) => t.id));
  const perProdotto = new Map(vendite.map((v) => [v.prodottoId as string, v._sum]));

  const cercato = cerca?.trim().toLowerCase() ?? "";
  return trovati
    .map((t) => {
      const skuComuni = t.varianti.map((v) => v.sku).filter((s) => s && sku.includes(s));
      const motivo =
        skuComuni.length > 0
          ? `stesso SKU (${skuComuni.slice(0, 2).join(", ")})`
          : base.handleShopify && t.handleShopify === base.handleShopify
            ? "stessa pagina su Shopify"
            : normalizza(t.nome) === chiave
              ? "stesso nome"
              : cercato && (t.nome.toLowerCase().includes(cercato) || t.codice.toLowerCase().includes(cercato))
                ? "trovato con la ricerca"
                : "nome simile";
      const s = perProdotto.get(t.id);
      return {
        id: t.id,
        nome: t.nome,
        codice: t.codice,
        prezzoVendita: t.prezzoVendita,
        vendorShopify: t.vendorShopify,
        tipoShopify: t.tipoShopify,
        vendite: s?.quantita ?? 0,
        ricavo: s?.ricavo ?? 0,
        motivo,
      };
    })
    .sort((a, b) => forza(b.motivo) - forza(a.motivo) || b.ricavo - a.ricavo);
}

function forza(motivo: string): number {
  if (motivo.startsWith("stesso SKU")) return 4;
  if (motivo.startsWith("stessa pagina")) return 3;
  if (motivo === "stesso nome") return 2;
  if (motivo === "nome simile") return 1;
  return 0;
}

export type GruppoDoppio = {
  chiave: string;
  prodotti: { id: string; nome: string; codice: string; prezzoVendita: number; vendorShopify: string | null }[];
};

/**
 * I doppioni evidenti di tutto il catalogo: schede diverse con lo stesso nome
 * ridotto all'osso. È la lista da cui partire — non pretende di trovarli tutti,
 * e infatti la pagina lo dice.
 */
export async function doppioniEvidenti(limite = 100): Promise<GruppoDoppio[]> {
  const prodotti = await prisma.prodotto.findMany({
    where: { unitoAId: null },
    select: { id: true, nome: true, codice: true, prezzoVendita: true, vendorShopify: true },
  });
  const per = new Map<string, GruppoDoppio["prodotti"]>();
  for (const p of prodotti) {
    const k = normalizza(p.nome);
    if (!k) continue;
    const lista = per.get(k) ?? [];
    lista.push(p);
    per.set(k, lista);
  }
  return [...per.entries()]
    .filter(([, l]) => l.length > 1)
    .map(([chiave, prodotti]) => ({ chiave, prodotti }))
    .sort((a, b) => b.prodotti.length - a.prodotti.length)
    .slice(0, limite);
}

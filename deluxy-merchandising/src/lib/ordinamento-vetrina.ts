// Le regole con cui l'app **propone** l'ordine dei prodotti di una collezione in
// vetrina. È solo il punto di partenza: dopo si ritocca a mano con le frecce, e
// quello che resta è l'ordine che si spinge su Shopify.
//
// La regola non è un ordinamento "vivo" come le smart collection di Shopify:
// qui si materializza in un numero (`posizione`) su ogni prodotto, così l'ordine
// è stabile, si può correggere a mano e si può mandare al negozio uguale.

import { prisma } from "./db";
import { FILTRO_BUON_FINE } from "./vendite";

export type RegolaOrdinamento =
  | "manuale"
  | "best_seller"
  | "ricavo"
  | "novita"
  | "margine"
  | "prezzo_desc"
  | "prezzo_asc";

export const REGOLE: { chiave: RegolaOrdinamento; nome: string; spiega: string }[] = [
  { chiave: "best_seller", nome: "Più venduti in cima", spiega: "Chi ha venduto più pezzi (a buon fine) negli ultimi 90 giorni." },
  { chiave: "ricavo", nome: "Più fatturato in cima", spiega: "Chi ha incassato di più negli ultimi 90 giorni." },
  { chiave: "novita", nome: "Novità prima", spiega: "I prodotti aggiunti più di recente al catalogo." },
  { chiave: "margine", nome: "Margine più alto in cima", spiega: "Dove il costo è inserito; i prodotti senza costo restano in fondo." },
  { chiave: "prezzo_desc", nome: "Prezzo alto in cima", spiega: "Dal listino più caro al più economico." },
  { chiave: "prezzo_asc", nome: "Prezzo basso in cima", spiega: "Dal listino più economico al più caro." },
  { chiave: "manuale", nome: "Solo a mano", spiega: "Nessuna regola: l'ordine lo decidi tu con le frecce." },
];

export function etichettaRegola(chiave: string | null | undefined): string {
  return REGOLE.find((r) => r.chiave === chiave)?.nome ?? "Solo a mano";
}

export function isRegola(v: unknown): v is RegolaOrdinamento {
  return typeof v === "string" && REGOLE.some((r) => r.chiave === v);
}

/**
 * L'ordine dei prodotti di una collezione secondo una regola. Ritorna gli id
 * prodotto nell'ordine nuovo; **non scrive niente** — la scrittura la fa
 * `numeraPosizioni`. Il pareggio si spezza sempre col nome, così l'ordine è
 * deterministico (due esecuzioni danno lo stesso risultato).
 */
export async function ordineSecondoRegola(
  collezioneId: string,
  regola: RegolaOrdinamento,
  giorni = 90
): Promise<string[]> {
  const membri = await prisma.prodottoInCollezioneShopify.findMany({
    where: { collezioneId },
    select: {
      prodottoId: true,
      posizione: true,
      prodotto: { select: { nome: true, prezzoVendita: true, costoProduzione: true, creatoIl: true } },
    },
  });

  if (regola === "manuale") {
    return [...membri]
      .sort((a, b) => a.posizione - b.posizione || a.prodotto.nome.localeCompare(b.prodotto.nome))
      .map((m) => m.prodottoId);
  }

  let venduto = new Map<string, { pezzi: number; ricavo: number }>();
  if (regola === "best_seller" || regola === "ricavo") {
    const da = new Date();
    da.setDate(da.getDate() - giorni);
    const agg = await prisma.vendita.groupBy({
      by: ["prodottoId"],
      where: { ...FILTRO_BUON_FINE, prodottoId: { in: membri.map((m) => m.prodottoId) }, data: { gte: da } },
      _sum: { quantita: true, ricavo: true },
    });
    venduto = new Map(
      agg
        .filter((a) => a.prodottoId)
        .map((a) => [a.prodottoId as string, { pezzi: a._sum.quantita ?? 0, ricavo: a._sum.ricavo ?? 0 }])
    );
  }

  const chiave = (m: (typeof membri)[number]): number => {
    const v = venduto.get(m.prodottoId);
    const prezzo = m.prodotto.prezzoVendita || 0;
    const costo = m.prodotto.costoProduzione || 0;
    switch (regola) {
      case "best_seller":
        return v?.pezzi ?? 0;
      case "ricavo":
        return v?.ricavo ?? 0;
      case "novita":
        return m.prodotto.creatoIl.getTime();
      case "margine":
        // Senza costo il margine non si sa: va in fondo, non a zero (stessa
        // regola del resto dell'app: un dato mancante si esclude, non vale 0).
        return prezzo > 0 && costo > 0 ? (prezzo - costo) / prezzo : -Infinity;
      case "prezzo_desc":
        return prezzo;
      case "prezzo_asc":
        return -prezzo;
      default:
        return 0;
    }
  };

  return [...membri]
    .sort((a, b) => chiave(b) - chiave(a) || a.prodotto.nome.localeCompare(b.prodotto.nome))
    .map((m) => m.prodottoId);
}

/**
 * Applica una regola a una collezione: materializza l'ordine in `posizione` e
 * segna sulla collezione qual è la regola e che l'ordine è cambiato. `manuale`
 * non tocca le posizioni (l'ordine lo cura la persona) ma resta registrato.
 * Riusata dall'azione di pagina, dall'assegnazione a una tipologia e dal
 * riapplico standing all'import: una funzione sola, così non divergono.
 */
export async function applicaRegolaACollezione(
  collezioneId: string,
  regola: RegolaOrdinamento
): Promise<void> {
  if (regola !== "manuale") {
    const ordine = await ordineSecondoRegola(collezioneId, regola);
    await numeraPosizioni(collezioneId, ordine);
  }
  await prisma.collezioneShopify.update({
    where: { id: collezioneId },
    data: { regolaOrdinamento: regola, ordineModificatoIl: new Date() },
  });
}

/**
 * Riapplica le regole **standing** delle tipologie alle collezioni di un negozio.
 * Serve all'import: quando arrivano prodotti nuovi, una collezione gestita da una
 * tipologia con regola li deve risistemare da sola invece di lasciarli in fondo.
 * Le collezioni **senza** tipologia (o con tipologia senza regola) non si toccano:
 * lì l'ordine è curato a mano e non va sovrascritto. Ritorna quante ne ha rifatte.
 */
export async function riapplicaStandingPerNegozio(negozio: string): Promise<number> {
  const colls = await prisma.collezioneShopify.findMany({
    where: { negozio, tipologia: { is: { regolaOrdinamento: { not: null } } } },
    select: { id: true, tipologia: { select: { regolaOrdinamento: true } } },
  });
  let fatte = 0;
  for (const c of colls) {
    const r = c.tipologia?.regolaOrdinamento;
    if (isRegola(r) && r !== "manuale") {
      await applicaRegolaACollezione(c.id, r);
      fatte++;
    }
  }
  return fatte;
}

/**
 * Scrive `posizione = 0..n-1` seguendo l'ordine dato. A blocchi e non in una
 * transazione unica: una collezione grande può avere migliaia di prodotti e una
 * transazione così lunga andrebbe in timeout.
 */
export async function numeraPosizioni(collezioneId: string, ordineProdottoId: string[]): Promise<void> {
  const membri = await prisma.prodottoInCollezioneShopify.findMany({
    where: { collezioneId },
    select: { id: true, prodottoId: true },
  });
  const idPerProdotto = new Map(membri.map((m) => [m.prodottoId, m.id]));
  for (let i = 0; i < ordineProdottoId.length; i += 50) {
    await Promise.all(
      ordineProdottoId.slice(i, i + 50).map((pid, k) => {
        const rigaId = idPerProdotto.get(pid);
        return rigaId
          ? prisma.prodottoInCollezioneShopify.update({ where: { id: rigaId }, data: { posizione: i + k } })
          : Promise.resolve();
      })
    );
  }
}

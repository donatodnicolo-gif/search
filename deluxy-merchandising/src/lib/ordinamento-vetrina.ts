// Le regole con cui l'app **propone** l'ordine dei prodotti di una collezione in
// vetrina. È solo il punto di partenza: dopo si ritocca a mano con le frecce, e
// quello che resta è l'ordine che si spinge su Shopify.
//
// La regola non è un ordinamento "vivo" come le smart collection di Shopify:
// qui si materializza in un numero (`posizione`) su ogni prodotto, così l'ordine
// è stabile, si può correggere a mano e si può mandare al negozio uguale.

import { prisma } from "./db";
import { FILTRO_BUON_FINE } from "./vendite";

/**
 * **In scena ci va solo quello che il cliente vede.**
 *
 * Le collezioni del negozio contengono anche prodotti **archiviati** o in bozza
 * su Shopify: al 03/08/2026 sono la maggioranza di quello che l'import ha
 * portato (1.535 schede create su 2.273; su deluxy.it 1.847 prodotti archiviati
 * su 2.932, verificato a parte). Ordinare e spingere su Shopify una fila
 * calcolata anche su quelli vuol dire decidere l'ordine di una vetrina che non
 * esiste: restano in archivio — non si cancella niente — ma fuori dalla scena.
 *
 * **Due condizioni, e servono tutte e due.** `statoShopify` è lo stato letto dal
 * negozio a ogni import ed è quello che decide se il cliente lo vede; `fase` è
 * la leva **umana** (è così che si tolgono di mezzo le righe di servizio tipo
 * `_Additional Price`). Guardare solo la fase non bastava: i 2.171 prodotti nati
 * dal venduto hanno `fase = in_vendita` per default, anche quando sul negozio
 * sono archiviati — sarebbero rimasti in vetrina.
 *
 * `statoShopify` nullo = prodotto mai visto su un negozio: non sta in nessuna
 * collezione, quindi in vetrina non ci arriva comunque.
 */
export const FILTRO_IN_SCENA = { statoShopify: "ACTIVE", fase: { not: "archiviato" } } as const;

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

export function isRegola(v: unknown): v is RegolaOrdinamento {
  return typeof v === "string" && REGOLE.some((r) => r.chiave === v);
}

/**
 * Un ordine può essere fatto di **più regole in priorità**: la prima decide, le
 * successive spezzano i pareggi (più venduti → a parità, margine → a parità,
 * prezzo…). In `regolaOrdinamento` si salvano separate da virgola. `manuale`
 * non è una regola, quindi si scarta dall'elenco: [] significa «solo a mano».
 */
export function parseRegole(valore: string | null | undefined): RegolaOrdinamento[] {
  if (!valore) return [];
  const out: RegolaOrdinamento[] = [];
  for (const raw of valore.split(",")) {
    const v = raw.trim();
    if (isRegola(v) && v !== "manuale" && !out.includes(v)) out.push(v);
  }
  return out;
}

export function serializeRegole(regole: RegolaOrdinamento[]): string {
  const clean = regole.filter((r) => r !== "manuale");
  return clean.length ? clean.join(",") : "manuale";
}

/** Legge da un form la lista ordinata di regole (campi `regola`, in priorità). */
export function regoleDaForm(fd: FormData): RegolaOrdinamento[] {
  const out: RegolaOrdinamento[] = [];
  for (const v of fd.getAll("regola")) {
    if (isRegola(v) && v !== "manuale" && !out.includes(v)) out.push(v);
  }
  return out;
}

/** L'etichetta leggibile di un ordine, singolo o a più criteri: «A → B → C». */
export function etichettaRegola(valore: string | null | undefined): string {
  const rs = parseRegole(valore);
  if (rs.length === 0) return "Solo a mano";
  return rs.map((r) => REGOLE.find((x) => x.chiave === r)?.nome ?? r).join(" → ");
}

/** Il minimo che serve per ordinare un prodotto secondo le regole. */
export type ProdottoOrdinabile = {
  prodottoId: string;
  nome: string;
  prezzoVendita: number;
  costoProduzione: number;
  creatoIl: Date;
  posizione?: number; // l'ordine curato a mano, dove esiste
};

/**
 * Ordina un insieme di prodotti secondo **una o più regole** in priorità: la
 * prima decide, le successive spezzano i pareggi, e il pareggio finale si spezza
 * col nome (così due esecuzioni danno lo stesso risultato).
 *
 * La usano sia l'ordine dentro una collezione sia l'anteprima di una tipologia:
 * una funzione sola, altrimenti lo stesso concetto finirebbe per ordinare in due
 * modi diversi.
 */
export async function ordinaProdotti<T extends ProdottoOrdinabile>(
  items: T[],
  regole: RegolaOrdinamento[],
  giorni = 90
): Promise<T[]> {
  const effettive = regole.filter((r) => r !== "manuale");
  if (effettive.length === 0) {
    return [...items].sort((a, b) => (a.posizione ?? 0) - (b.posizione ?? 0) || a.nome.localeCompare(b.nome));
  }

  let venduto = new Map<string, { pezzi: number; ricavo: number }>();
  if (effettive.some((r) => r === "best_seller" || r === "ricavo")) {
    const da = new Date();
    da.setDate(da.getDate() - giorni);
    // Si raggruppa tutto il venduto della finestra invece di elencare gli id:
    // una lista lunga rende la query più pesante del giro completo.
    const agg = await prisma.vendita.groupBy({
      by: ["prodottoId"],
      where: { ...FILTRO_BUON_FINE, data: { gte: da } },
      _sum: { quantita: true, ricavo: true },
    });
    venduto = new Map(
      agg
        .filter((a) => a.prodottoId)
        .map((a) => [a.prodottoId as string, { pezzi: a._sum.quantita ?? 0, ricavo: a._sum.ricavo ?? 0 }])
    );
  }

  // Valore per una singola regola: più alto = più in cima (prezzo_asc torna il
  // prezzo negato, così la logica di ordinamento è sempre «decrescente»).
  const valore = (m: T, regola: RegolaOrdinamento): number => {
    const v = venduto.get(m.prodottoId);
    const prezzo = m.prezzoVendita || 0;
    const costo = m.costoProduzione || 0;
    switch (regola) {
      case "best_seller":
        return v?.pezzi ?? 0;
      case "ricavo":
        return v?.ricavo ?? 0;
      case "novita":
        return m.creatoIl.getTime();
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

  return [...items].sort((a, b) => {
    for (const r of effettive) {
      const d = valore(b, r) - valore(a, r);
      if (d !== 0) return d;
    }
    return a.nome.localeCompare(b.nome);
  });
}

/**
 * L'ordine dei prodotti di una collezione secondo una o più regole. Ritorna gli
 * id prodotto nell'ordine nuovo; **non scrive niente** — la scrittura la fa
 * `numeraPosizioni`.
 */
export async function ordineSecondoRegole(
  collezioneId: string,
  regole: RegolaOrdinamento[],
  giorni = 90
): Promise<string[]> {
  const membri = await prisma.prodottoInCollezioneShopify.findMany({
    where: { collezioneId, prodotto: FILTRO_IN_SCENA },
    select: {
      prodottoId: true,
      posizione: true,
      prodotto: { select: { nome: true, prezzoVendita: true, costoProduzione: true, creatoIl: true } },
    },
  });
  const items = membri.map((m) => ({
    prodottoId: m.prodottoId,
    posizione: m.posizione,
    nome: m.prodotto.nome,
    prezzoVendita: m.prodotto.prezzoVendita,
    costoProduzione: m.prodotto.costoProduzione,
    creatoIl: m.prodotto.creatoIl,
  }));
  return (await ordinaProdotti(items, regole, giorni)).map((m) => m.prodottoId);
}

/**
 * Applica una o più regole a una collezione: materializza l'ordine in
 * `posizione` e segna sulla collezione quali regole e che l'ordine è cambiato.
 * Nessuna regola effettiva (solo «manuale») non tocca le posizioni ma resta
 * registrato. Riusata da: azione di pagina, assegnazione a tipologia, riapplico
 * standing all'import — una funzione sola, così non divergono.
 */
export async function applicaRegoleACollezione(
  collezioneId: string,
  regole: RegolaOrdinamento[]
): Promise<void> {
  const effettive = regole.filter((r) => r !== "manuale");
  if (effettive.length > 0) {
    const ordine = await ordineSecondoRegole(collezioneId, effettive);
    await numeraPosizioni(collezioneId, ordine);
  }
  await prisma.collezioneShopify.update({
    where: { id: collezioneId },
    data: { regolaOrdinamento: serializeRegole(regole), ordineModificatoIl: new Date() },
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
    const rs = parseRegole(c.tipologia?.regolaOrdinamento);
    if (rs.length > 0) {
      await applicaRegoleACollezione(c.id, rs);
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

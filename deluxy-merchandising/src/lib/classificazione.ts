// Come Deluxy classifica i suoi prodotti: **categorie**, **linee** e
// **collezioni**, decise qui dentro e non ereditate da Shopify.
//
// Ogni voce ha una descrizione. Serve a due lettori diversi:
// - alla persona, per sapere cosa ci va dentro e cosa no;
// - all'**AI**, che con quella descrizione può proporre a quale categoria o
//   linea appartiene un prodotto importato dai negozi — dove la stessa cosa si
//   chiama «Fiori», «Rose», «Bouquet». Senza descrizione l'AI tira a indovinare
//   sul nome, che è esattamente quello che qui non vogliamo.
//
// Le categorie nascono dal catalogo storico di `dominio.ts` la prima volta che
// si apre la pagina: nessuna migrazione a mano, e i prodotti già classificati
// continuano a funzionare perché la chiave resta la stessa.

import { prisma } from "./db";
import { CATEGORIE, ETICHETTA_CATEGORIA } from "./dominio";

export type CategoriaVoce = {
  chiave: string;
  nome: string;
  descrizione: string | null;
  ordine: number;
  attiva: boolean;
  prodotti: number;
};

export type LineaVoce = {
  id: string;
  nome: string;
  descrizione: string | null;
  ordine: number;
  attiva: boolean;
  prodotti: number;
};

const DESCRIZIONI_INIZIALI: Record<string, string> = {
  BOUQUET: "Fiori recisi composti a mano e legati: rose, peonie, tulipani, bouquet misti.",
  COMPOSIZIONE: "Fiori disposti in un contenitore — vaso, cappelliera, cesto — che si consegna già montato.",
  PIANTA: "Piante vive in vaso: orchidee, verdi da interno, bonsai.",
  GIFT_BOX: "Cofanetti e confezioni che mettono insieme più cose: fiori con candele, praline, champagne.",
  EDIZIONE_LIMITATA: "Pezzi numerati o disponibili per un periodo breve, spesso legati a una collaborazione.",
  ACCESSORIO: "Ciò che accompagna il prodotto senza esserlo: vasi, biglietti, nastri, palloncini.",
  HOME_FRAGRANCE: "Profumazione per la casa: candele, diffusori, ghirlande profumate.",
  DA_CLASSIFICARE: "Prodotti arrivati dall'import e non ancora assegnati. Non è una categoria vera: va svuotata.",
};

/** Crea le categorie storiche la prima volta. Idempotente. */
export async function assicuraCategorie(): Promise<void> {
  const quante = await prisma.categoriaProdotto.count();
  if (quante > 0) return;
  await prisma.categoriaProdotto.createMany({
    data: CATEGORIE.map((c, i) => ({
      chiave: c,
      nome: ETICHETTA_CATEGORIA[c] ?? c,
      descrizione: DESCRIZIONI_INIZIALI[c] ?? null,
      ordine: i,
    })),
    skipDuplicates: true,
  });
}

export async function elencoCategorie(): Promise<CategoriaVoce[]> {
  await assicuraCategorie();
  const [righe, conteggi] = await Promise.all([
    prisma.categoriaProdotto.findMany({ orderBy: [{ ordine: "asc" }, { nome: "asc" }] }),
    prisma.prodotto.groupBy({ by: ["categoria"], _count: { _all: true } }),
  ]);
  const quanti = new Map(conteggi.map((c) => [c.categoria, c._count._all]));
  return righe.map((r) => ({
    chiave: r.chiave,
    nome: r.nome,
    descrizione: r.descrizione,
    ordine: r.ordine,
    attiva: r.attiva,
    prodotti: quanti.get(r.chiave) ?? 0,
  }));
}

export async function elencoLinee(): Promise<LineaVoce[]> {
  const righe = await prisma.lineaProdotto.findMany({
    orderBy: [{ ordine: "asc" }, { nome: "asc" }],
    include: { _count: { select: { prodotti: true } } },
  });
  return righe.map((r) => ({
    id: r.id,
    nome: r.nome,
    descrizione: r.descrizione,
    ordine: r.ordine,
    attiva: r.attiva,
    prodotti: r._count.prodotti,
  }));
}

/** Chiave tecnica a partire dal nome: MAIUSCOLO_CON_UNDERSCORE, senza accenti. */
export function chiaveDa(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40) || "CATEGORIA"
  );
}

/**
 * Il vocabolario in forma compatta, da dare all'AI quando dovrà proporre a
 * quale categoria/linea appartiene un prodotto. Sta qui e non nel prompt, così
 * cambiando una descrizione in pagina cambia anche quello che l'AI legge.
 */
export async function vocabolarioPerAI(): Promise<{
  categorie: { chiave: string; nome: string; descrizione: string | null }[];
  linee: { nome: string; descrizione: string | null }[];
  collezioni: { nome: string; descrizione: string | null }[];
}> {
  const [categorie, linee, collezioni] = await Promise.all([
    prisma.categoriaProdotto.findMany({ where: { attiva: true }, orderBy: { ordine: "asc" } }),
    prisma.lineaProdotto.findMany({ where: { attiva: true }, orderBy: { ordine: "asc" } }),
    prisma.collezione.findMany({ orderBy: { anno: "desc" } }),
  ]);
  return {
    categorie: categorie
      .filter((c) => c.chiave !== "DA_CLASSIFICARE")
      .map((c) => ({ chiave: c.chiave, nome: c.nome, descrizione: c.descrizione })),
    linee: linee.map((l) => ({ nome: l.nome, descrizione: l.descrizione })),
    collezioni: collezioni.map((c) => ({ nome: c.nome, descrizione: c.descrizione ?? c.tema })),
  };
}

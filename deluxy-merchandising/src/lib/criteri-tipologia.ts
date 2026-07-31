// I **criteri** di una tipologia: cosa rende un prodotto «Lusso», «Accessibile»,
// «Linea rose» o «Originale». Si mescolano liberamente — fascia di prezzo, linea,
// tipo del negozio, fornitore, area, novità, tag, collezione — perché nessuno di
// questi da solo descrive un mondo commerciale.
//
// Due regole di lettura, sempre le stesse:
// - **dentro** un criterio i valori valgono in alternativa (fascia Luxury *o*
//   Eccezionale);
// - **fra** criteri diversi valgono tutti insieme (fascia Luxury **e** tipo Fiori).
//
// I criteri stanno in un JSON su `TipologiaCollezione.criteri`: sono una forma
// che cambia (oggi otto voci, domani nove) e una colonna per criterio avrebbe
// voluto dire una migrazione a ogni idea nuova.

import { prisma } from "./db";
import { elencoFasce, filtroPrezzo, type Fascia } from "./fasce";

export type Criteri = {
  fasce?: string[]; // id di FasciaPrezzo
  linee?: string[]; // id di LineaProdotto
  tipi?: string[]; // tipoShopify (il «Tipo» del negozio)
  fornitori?: string[]; // vendorShopify (il «Venditore» del negozio)
  citta?: string[]; // area = città del fornitore interno (Fornitore.citta)
  collezioni?: string[]; // id di CollezioneShopify
  tag?: string[]; // parole nei tag Shopify
  novitaGiorni?: number; // creato negli ultimi N giorni
};

/** Le voci di criterio, nell'ordine in cui si mostrano. */
export const VOCI_CRITERIO = [
  { chiave: "fasce", nome: "Fascia di prezzo", campo: "fasce" },
  { chiave: "tipi", nome: "Tipo prodotto (dal negozio)", campo: "tipi" },
  { chiave: "fornitori", nome: "Fornitore (dal negozio)", campo: "fornitori" },
  { chiave: "linee", nome: "Linea", campo: "linee" },
  { chiave: "collezioni", nome: "Collezione del negozio", campo: "collezioni" },
  { chiave: "citta", nome: "Area (città del fornitore)", campo: "citta" },
  { chiave: "tag", nome: "Tag", campo: "tag" },
  { chiave: "novitaGiorni", nome: "Novità", campo: "novitaGiorni" },
] as const;

const lista = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
  return out.length ? out : undefined;
};

/** Legge i criteri salvati. Un JSON rotto vale «nessun criterio», non un errore. */
export function parseCriteri(valore: string | null | undefined): Criteri {
  if (!valore) return {};
  try {
    const g = JSON.parse(valore) as Record<string, unknown>;
    const n = Number(g.novitaGiorni);
    return {
      fasce: lista(g.fasce),
      linee: lista(g.linee),
      tipi: lista(g.tipi),
      fornitori: lista(g.fornitori),
      citta: lista(g.citta),
      collezioni: lista(g.collezioni),
      tag: lista(g.tag),
      novitaGiorni: Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined,
    };
  } catch {
    return {};
  }
}

export function serializeCriteri(c: Criteri): string {
  const pulito: Criteri = {
    fasce: lista(c.fasce),
    linee: lista(c.linee),
    tipi: lista(c.tipi),
    fornitori: lista(c.fornitori),
    citta: lista(c.citta),
    collezioni: lista(c.collezioni),
    tag: lista(c.tag),
    novitaGiorni: c.novitaGiorni && c.novitaGiorni > 0 ? c.novitaGiorni : undefined,
  };
  const senzaVuoti = Object.fromEntries(Object.entries(pulito).filter(([, v]) => v !== undefined));
  return JSON.stringify(senzaVuoti);
}

/** Quanti criteri sono stati davvero impostati. 0 = la tipologia non filtra niente. */
export function quantiCriteri(c: Criteri): number {
  return [c.fasce, c.linee, c.tipi, c.fornitori, c.citta, c.collezioni, c.tag, c.novitaGiorni].filter(
    (v) => v !== undefined
  ).length;
}

/** Legge i criteri da un form: campi `crit_<voce>` ripetuti. */
export function criteriDaForm(fd: FormData): Criteri {
  const prendi = (k: string) =>
    fd.getAll(`crit_${k}`).filter((v): v is string => typeof v === "string" && v.trim() !== "");
  const giorni = Number(fd.get("crit_novitaGiorni"));
  // I tag si scrivono a mano in una casella, uno per riga (o separati da
  // virgola): non c'è un elenco chiuso da cui sceglierli.
  const tagTesto = fd.get("crit_tag_testo");
  const tag = typeof tagTesto === "string" ? tagTesto.split(/[\n,]+/).map((t) => t.trim()) : [];
  return {
    fasce: lista(prendi("fasce")),
    linee: lista(prendi("linee")),
    tipi: lista(prendi("tipi")),
    fornitori: lista(prendi("fornitori")),
    citta: lista(prendi("citta")),
    collezioni: lista(prendi("collezioni")),
    tag: lista(tag),
    novitaGiorni: Number.isFinite(giorni) && giorni > 0 ? Math.floor(giorni) : undefined,
  };
}

/**
 * Il filtro Prisma sui prodotti che corrispondono ai criteri.
 *
 * Senza nessun criterio ritorna `null`: **non** un filtro vuoto, che
 * selezionerebbe tutto il catalogo. Una tipologia senza criteri non è «tutti i
 * prodotti», è una tipologia da finire di scrivere, e chi chiama deve poterlo
 * distinguere.
 *
 * Restano sempre fuori i prodotti archiviati e quelli esclusi dalle analisi: non
 * sono assortimento, e comparirebbero in ogni segmento.
 */
export async function filtroCriteri(c: Criteri): Promise<Record<string, unknown> | null> {
  if (quantiCriteri(c) === 0) return null;

  const e: Record<string, unknown>[] = [];

  if (c.fasce?.length) {
    const tutte = await elencoFasce();
    const scelte = tutte.filter((f: Fascia) => c.fasce!.includes(f.id));
    // `filtroPrezzo` dà la condizione sul prezzo (es. `{gte: 100, lt: 200}`):
    // va messa sul campo, e le fasce scelte valgono in alternativa.
    if (scelte.length) e.push({ OR: scelte.map((f) => ({ prezzoVendita: filtroPrezzo(f) })) });
  }
  if (c.linee?.length) e.push({ lineaId: { in: c.linee } });
  if (c.tipi?.length) e.push({ tipoShopify: { in: c.tipi } });
  if (c.fornitori?.length) e.push({ vendorShopify: { in: c.fornitori } });
  // L'area è la città del **fornitore interno**: si passa dalla relazione, non
  // da un campo del prodotto (che non esiste).
  if (c.citta?.length) e.push({ fornitore: { is: { citta: { in: c.citta } } } });
  if (c.collezioni?.length) e.push({ collezioniShopify: { some: { collezioneId: { in: c.collezioni } } } });
  if (c.tag?.length) {
    // I tag arrivano da Shopify in una stringa sola separata da virgole: si
    // cerca la parola, senza distinguere maiuscole e minuscole.
    e.push({ OR: c.tag.map((t) => ({ tagShopify: { contains: t, mode: "insensitive" as const } })) });
  }
  if (c.novitaGiorni) {
    const da = new Date();
    da.setDate(da.getDate() - c.novitaGiorni);
    e.push({ creatoIl: { gte: da } });
  }

  return { fase: { not: "archiviato" }, esclusoDaAnalisi: false, AND: e };
}

/** I dizionari per mostrare e nominare i criteri in pagina. */
export async function vociDisponibili() {
  const [fasce, linee, tipi, fornitori, collezioni, citta] = await Promise.all([
    elencoFasce(),
    prisma.lineaProdotto.findMany({ where: { attiva: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.prodotto.findMany({
      where: { tipoShopify: { not: null } },
      distinct: ["tipoShopify"],
      orderBy: { tipoShopify: "asc" },
      select: { tipoShopify: true },
    }),
    prisma.prodotto.findMany({
      where: { vendorShopify: { not: null } },
      distinct: ["vendorShopify"],
      orderBy: { vendorShopify: "asc" },
      select: { vendorShopify: true },
    }),
    prisma.collezioneShopify.findMany({
      orderBy: [{ negozio: "asc" }, { titolo: "asc" }],
      select: { id: true, titolo: true, negozio: true },
    }),
    prisma.fornitore.findMany({
      where: { citta: { not: null } },
      distinct: ["citta"],
      orderBy: { citta: "asc" },
      select: { citta: true },
    }),
  ]);
  return {
    fasce,
    linee,
    tipi: tipi.map((t) => t.tipoShopify).filter((x): x is string => !!x),
    fornitori: fornitori.map((f) => f.vendorShopify).filter((x): x is string => !!x),
    collezioni,
    citta: citta.map((c) => c.citta).filter((x): x is string => !!x),
  };
}

export type VociDisponibili = Awaited<ReturnType<typeof vociDisponibili>>;

/** I criteri detti a parole, per l'elenco delle tipologie. */
export function descriviCriteri(c: Criteri, v: VociDisponibili): string {
  const parti: string[] = [];
  const nomi = (ids: string[] | undefined, dizionario: { id: string; nome?: string; titolo?: string }[]) =>
    (ids ?? []).map((id) => dizionario.find((d) => d.id === id)?.nome ?? dizionario.find((d) => d.id === id)?.titolo ?? id);

  if (c.fasce?.length) parti.push(`fascia ${nomi(c.fasce, v.fasce).join(" o ")}`);
  if (c.tipi?.length) parti.push(`tipo ${c.tipi.join(" o ")}`);
  if (c.fornitori?.length) parti.push(`fornitore ${c.fornitori.join(" o ")}`);
  if (c.linee?.length) parti.push(`linea ${nomi(c.linee, v.linee).join(" o ")}`);
  if (c.collezioni?.length) parti.push(`collezione ${nomi(c.collezioni, v.collezioni).join(" o ")}`);
  if (c.citta?.length) parti.push(`area ${c.citta.join(" o ")}`);
  if (c.tag?.length) parti.push(`tag ${c.tag.join(" o ")}`);
  if (c.novitaGiorni) parti.push(`aggiunto negli ultimi ${c.novitaGiorni} giorni`);
  return parti.length ? parti.join(" · e ") : "nessun criterio";
}

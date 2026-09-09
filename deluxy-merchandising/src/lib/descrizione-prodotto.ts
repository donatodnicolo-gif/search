// **La descrizione di un prodotto per un negozio: un posto solo.**
//
// Import e pubblicazione devono usare la STESSA regola, altrimenti si
// distruggono a vicenda: l'import spezza l'HTML nei pezzi, la pubblicazione lo
// ricompone. Se le due parti non corrispondono, il primo salvataggio di un
// prodotto **sovrascrive sul negozio la scheda ricca con quello che è rimasto
// nel campo descrizione** — cioè cancella le tab dal sito.
//
// Qui sta la parte che serve a comporre: quali sezioni, in che ordine, coi
// valori giusti per quel negozio.

import { prisma } from "./db";
import { componiDescrizioneHtml, sezioniDelSito, type SezioneDaScrivere } from "./descrizione-shopify";
import { etichettaCategoria } from "./dominio";

export type SchedaProdotto = {
  plusProdotto?: string | null;
  descrizione?: string | null;
  categoria: string;
  /** `{ "Gifts": { "Menù": "…" } }` */
  sezioniScheda?: unknown;
};

type SezioneDefinita = { categoria: string; negozio: string | null; nome: string; tipo: string; ordine: number };

const senzaAccenti = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function valoriDi(p: SchedaProdotto, sito: string): Record<string, string> {
  const s = p.sezioniScheda;
  if (!s || typeof s !== "object" || Array.isArray(s)) return {};
  const perSito = (s as Record<string, unknown>)[sito];
  if (!perSito || typeof perSito !== "object" || Array.isArray(perSito)) return {};
  const fuori: Record<string, string> = {};
  for (const [k, v] of Object.entries(perSito as Record<string, unknown>)) if (typeof v === "string") fuori[k] = v;
  return fuori;
}

/**
 * Le sezioni da scrivere per questo prodotto su questo negozio: **prima quelle
 * previste**, nel loro ordine, **poi quelle che il prodotto ha ma che non sono
 * più previste**.
 *
 * ⚠️ Il secondo gruppo non è un dettaglio: le sezioni previste cambiano nel
 * tempo (ne abbiamo spente e riaccese oggi stesso). Componendo solo le previste,
 * un testo scritto sotto una sezione poi tolta **sparirebbe dalla scheda
 * online** al primo salvataggio, senza che nessuno lo cancelli. Si tiene in
 * coda: visibile al cliente, e recuperabile.
 */
export function sezioniDaScrivere(p: SchedaProdotto, sito: string, definite: SezioneDefinita[]): SezioneDaScrivere[] {
  const valori = valoriDi(p, sito);
  const previste = sezioniDelSito(definite, p.categoria, sito);
  const fuori: SezioneDaScrivere[] = [];
  const gia = new Set<string>();
  previste
    .slice()
    .sort((a, b) => a.ordine - b.ordine)
    .forEach((s, i) => {
      gia.add(senzaAccenti(s.nome));
      const v = valori[s.nome] ?? valori[Object.keys(valori).find((k) => senzaAccenti(k) === senzaAccenti(s.nome)) ?? ""] ?? "";
      if (v.trim()) fuori.push({ nome: s.nome, tipo: s.tipo, ordine: i, valore: v });
    });
  let coda = previste.length;
  for (const [nome, valore] of Object.entries(valori)) {
    if (gia.has(senzaAccenti(nome))) continue;
    if (!valore.trim()) continue;
    fuori.push({ nome, tipo: "testo", ordine: coda++, valore });
  }
  return fuori;
}

/**
 * L'HTML da mandare a Shopify per questo prodotto su questo negozio.
 * Torna stringa vuota se non c'è niente: chi chiama deve **non toccare** la
 * descrizione sul negozio invece di scriverci il vuoto.
 */
export async function descrizionePerNegozio(p: SchedaProdotto, sito: string): Promise<string> {
  const [negozio, definite] = await Promise.all([
    prisma.negozioShopify.findFirst({ where: { nome: sito }, select: { plusUno: true, plusDue: true } }),
    prisma.sezioneCategoria.findMany({
      where: { attiva: true, categoria: p.categoria },
      select: { categoria: true, negozio: true, nome: true, tipo: true, ordine: true },
    }),
  ]);
  return componiDescrizioneHtml({
    // L'etichetta in grassetto del primo punto, quando il plus non ne ha una sua.
    etichettaCategoria: etichettaCategoria(p.categoria),
    plusProdotto: p.plusProdotto,
    plusUno: negozio?.plusUno,
    plusDue: negozio?.plusDue,
    descrizione: p.descrizione,
    sezioni: sezioniDaScrivere(p, sito, definite),
  });
}

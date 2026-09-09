// I dati che le pagine del modulo prodotto (nuovo e modifica) mettono davanti
// al componente: negozi, categorie, collezioni manuali, definizioni dei
// metafield per negozio, chiave AI. Una funzione sola per le due pagine.

import type { CategoriaPerForm, CollezionePerForm, NegozioPerForm, SezionePerForm } from "@/components/FormProdottoNuovo";
import { elencoCategorie } from "./classificazione";
import { prisma } from "./db";
import { definizioniDelNegozio, type DefinizioneMetafield } from "./metafield-definizioni";
import { elencoNegozi, negoziAttivi } from "./negozi";
import { statoSegreto } from "./segreti";

export async function datiModuloProdotto(): Promise<{
  negozi: NegozioPerForm[];
  categorie: CategoriaPerForm[];
  collezioni: CollezionePerForm[];
  definizioniPerNegozio: Record<string, DefinizioneMetafield[]>;
  tagEsistenti: string[];
  aiPronta: boolean;
  /** ⭐ 08/09/2026: le sezioni per categoria e negozio, che il modulo mostra
   *  quando si sceglie la categoria. */
  sezioni: SezionePerForm[];
  /** I due plus di ciascun sito: le righe 2 e 3 dell'elenco in cima alla scheda. */
  plusNegozio: Record<string, { uno: string; due: string }>;
  /**
   * ⭐ 09/09/2026: i «Tipo di prodotto» in uso, **con le categorie che li usano**.
   * Servono le categorie perché il modulo filtra l'elenco su quella scelta
   * (richiesta dell'utente): senza il legame, il filtro non si può fare.
   */
  tipiShopify: { tipo: string; categorie: string[] }[];
}> {
  const [negozi, categorie, collezioni, prompt, chiaveAi, attivi, conTag, sezioni, tipi] = await Promise.all([
    elencoNegozi(),
    elencoCategorie(),
    prisma.collezioneShopify.findMany({ where: { tipo: "manuale" }, orderBy: [{ negozio: "asc" }, { titolo: "asc" }], select: { id: true, titolo: true, negozio: true } }),
    prisma.promptCategoria.findMany({ select: { categoria: true } }),
    statoSegreto("OPENAI_API_KEY"),
    negoziAttivi(),
    // I tag già in uso sui prodotti attivi: i suggerimenti del modulo, per frequenza.
    prisma.prodotto.findMany({ where: { tagShopify: { not: null }, statoShopify: "ACTIVE" }, select: { tagShopify: true } }),
    prisma.sezioneCategoria.findMany({
      where: { attiva: true },
      orderBy: [{ categoria: "asc" }, { ordine: "asc" }],
      select: { categoria: true, negozio: true, nome: true, tipo: true, richiesta: true, ordine: true },
    }),
    // ⭐ 09/09/2026: i «Tipo di prodotto» veri, **presi dai nostri prodotti**
    // e non da un elenco scritto a mano. Raggruppati per categoria+tipo perché
    // il modulo deve poter filtrare: misurate 183 coppie su 120 tipi diversi.
    // ⚠️ Il tipo NON si deduce dalla categoria — la stessa REGALI usa
    // «Peluche», «Accessori», «Giochi», «Cosmetici», «Borse», «Palloncini» —
    // quindi il legame va letto, non calcolato.
    prisma.prodotto.groupBy({ by: ["categoria", "tipoShopify"], _count: true, where: { tipoShopify: { not: null } } }),
  ]);
  const conteggio = new Map<string, number>();
  for (const p of conTag) for (const t of (p.tagShopify ?? "").split(",").map((s) => s.trim()).filter(Boolean)) conteggio.set(t, (conteggio.get(t) ?? 0) + 1);
  const tagEsistenti = [...conteggio.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 400).map(([t]) => t).sort((a, b) => a.localeCompare(b));
  const conPrompt = new Set(prompt.map((p) => p.categoria));
  // Le definizioni: dalla cache di un giorno; la prima volta si leggono dal negozio.
  const definizioniPerNegozio: Record<string, DefinizioneMetafield[]> = {};
  for (const n of attivi) definizioniPerNegozio[n.nome] = await definizioniDelNegozio(n);
  return {
    negozi: negozi.filter((n) => n.attivo).map((n) => ({ id: n.id, nome: n.nome, dominio: n.dominio, puoScrivere: n.permessi.includes("write_products"), lingueAttive: n.lingueAttive })),
    categorie: categorie.filter((c) => c.attiva && c.chiave !== "DA_CLASSIFICARE").map((c) => ({ chiave: c.chiave, nome: c.nome, negozio: c.negozio, conPrompt: conPrompt.has(c.chiave) })),
    collezioni,
    definizioniPerNegozio,
    tagEsistenti,
    aiPronta: chiaveAi.presente,
    sezioni,
    // I plus del sito: si leggono da tutti i negozi, anche spenti, perché un
    // prodotto può essere ancora pubblicato su un negozio sospeso.
    plusNegozio: Object.fromEntries(negozi.map((n) => [n.nome, { uno: n.plusUno ?? "", due: n.plusDue ?? "" }])),
    // Un tipo può stare sotto più categorie («Palloncini» è di ORIGINALI_DELUXY
    // e di REGALI): si tiene l'elenco delle sue, non una sola.
    tipiShopify: (() => {
      const per = new Map<string, Set<string>>();
      for (const t of tipi) {
        if (!t.tipoShopify) continue;
        const gia = per.get(t.tipoShopify) ?? new Set<string>();
        gia.add(t.categoria);
        per.set(t.tipoShopify, gia);
      }
      return [...per.entries()]
        .map(([tipo, cats]) => ({ tipo, categorie: [...cats] }))
        .sort((a, b) => a.tipo.localeCompare(b.tipo, "it"));
    })(),
  };
}

// I dati che le pagine del modulo prodotto (nuovo e modifica) mettono davanti
// al componente: negozi, categorie, collezioni manuali, definizioni dei
// metafield per negozio, chiave AI. Una funzione sola per le due pagine.

import type { CategoriaPerForm, CollezionePerForm, NegozioPerForm } from "@/components/FormProdottoNuovo";
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
}> {
  const [negozi, categorie, collezioni, prompt, chiaveAi, attivi, conTag] = await Promise.all([
    elencoNegozi(),
    elencoCategorie(),
    prisma.collezioneShopify.findMany({ where: { tipo: "manuale" }, orderBy: [{ negozio: "asc" }, { titolo: "asc" }], select: { id: true, titolo: true, negozio: true } }),
    prisma.promptCategoria.findMany({ select: { categoria: true } }),
    statoSegreto("OPENAI_API_KEY"),
    negoziAttivi(),
    // I tag già in uso sui prodotti attivi: i suggerimenti del modulo, per frequenza.
    prisma.prodotto.findMany({ where: { tagShopify: { not: null }, statoShopify: "ACTIVE" }, select: { tagShopify: true } }),
  ]);
  const conteggio = new Map<string, number>();
  for (const p of conTag) for (const t of (p.tagShopify ?? "").split(",").map((s) => s.trim()).filter(Boolean)) conteggio.set(t, (conteggio.get(t) ?? 0) + 1);
  const tagEsistenti = [...conteggio.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 400).map(([t]) => t).sort((a, b) => a.localeCompare(b));
  const conPrompt = new Set(prompt.map((p) => p.categoria));
  // Le definizioni: dalla cache di un giorno; la prima volta si leggono dal negozio.
  const definizioniPerNegozio: Record<string, DefinizioneMetafield[]> = {};
  for (const n of attivi) definizioniPerNegozio[n.nome] = await definizioniDelNegozio(n);
  return {
    negozi: negozi.filter((n) => n.attivo).map((n) => ({ id: n.id, nome: n.nome, dominio: n.dominio, puoScrivere: n.permessi.includes("write_products") })),
    categorie: categorie.filter((c) => c.attiva && c.chiave !== "DA_CLASSIFICARE").map((c) => ({ chiave: c.chiave, nome: c.nome, negozio: c.negozio, conPrompt: conPrompt.has(c.chiave) })),
    collezioni,
    definizioniPerNegozio,
    tagEsistenti,
    aiPronta: chiaveAi.presente,
  };
}

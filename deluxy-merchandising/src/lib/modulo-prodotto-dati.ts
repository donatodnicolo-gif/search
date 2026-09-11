// I dati che le pagine del modulo prodotto (nuovo e modifica) mettono davanti
// al componente: negozi, categorie, collezioni manuali, definizioni dei
// metafield per negozio, chiave AI. Una funzione sola per le due pagine.

import type { CategoriaPerForm, CollezionePerForm, NegozioPerForm, SezionePerForm } from "@/components/FormProdottoNuovo";
import { elencoCategorie } from "./classificazione";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { conCampiStorici, definizioniDelNegozio, type DefinizioneMetafield } from "./metafield-definizioni";
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
  /**
   * ⭐ 10/09/2026 (utente: «assicurati che per tutti i prodotti nuovi carichiamo
   * tutti i metafield»). Per ogni sito, per ogni chiave: **su quale quota delle
   * schede attive di quel sito sta** e **il valore più usato**. È la mappa di
   * cosa il sito si aspetta, letta dai prodotti veri e non scritta a mano: il
   * modulo segna con l'asterisco i campi sopra la metà e, su un prodotto nuovo,
   * fa partire quelli operativi dal valore tipico.
   */
  attesiPerNegozio: Record<string, Record<string, { quota: number; tipico: string | null }>>;
  /** I partner già scritti sui prodotti attivi di ogni sito (`custom.partner_id` + indirizzo): la tendina del modulo. */
  partnerNoti: Record<string, { id: string; indirizzo: string; insegna: string | null; prodotti: number }[]>;
}> {
  const [negozi, categorie, collezioni, prompt, chiaveAi, attivi, conTag, sezioni, tipi, attiviConCampi] = await Promise.all([
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
    // I metafield delle schede attive, col negozio su cui sono attive: da qui
    // gli attesi per sito e i partner noti (vedi sotto).
    prisma.prodotto.findMany({
      where: { statoShopify: "ACTIVE", metafieldShopify: { not: Prisma.DbNull } },
      select: {
        negozioNome: true,
        metafieldShopify: true,
        // ⭐ 11/09/2026 (regola utente: «al posto del partner id indica il nome
        // del partner»). L'insegna non sta nei metafield: sta sulle colonne dei
        // prodotti arrivati dalla piattaforma, accanto all'id numerico. Ogni
        // prodotto che porta tutti e due ci insegna un nome.
        partnerIdShopify: true,
        partnerInsegna: true,
        pubblicazioni: { where: { statoShopify: "ACTIVE" }, select: { negozio: true } },
      },
    }),
  ]);
  const { attesiPerNegozio, partnerNoti } = attesiDaiProdotti(attiviConCampi);
  const conteggio = new Map<string, number>();
  for (const p of conTag) for (const t of (p.tagShopify ?? "").split(",").map((s) => s.trim()).filter(Boolean)) conteggio.set(t, (conteggio.get(t) ?? 0) + 1);
  const tagEsistenti = [...conteggio.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 400).map(([t]) => t).sort((a, b) => a.localeCompare(b));
  const conPrompt = new Set(prompt.map((p) => p.categoria));
  // Le definizioni: dalla cache di un giorno; la prima volta si leggono dal negozio.
  const definizioniPerNegozio: Record<string, DefinizioneMetafield[]> = {};
  for (const n of attivi) definizioniPerNegozio[n.nome] = conCampiStorici(await definizioniDelNegozio(n));
  return {
    negozi: negozi.filter((n) => n.attivo).map((n) => ({ id: n.id, nome: n.nome, dominio: n.dominio, puoScrivere: n.permessi.includes("write_products"), lingueAttive: n.lingueAttive, canaleVendite: n.canaleVendite })),
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
    attesiPerNegozio,
    partnerNoti,
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

/**
 * Da una scheda attiva ai siti su cui è attiva: le righe di `PubblicazioneNegozio`
 * se ci sono, altrimenti il negozio principale. Poi, per sito e per chiave, la
 * quota e il valore più frequente; e i partner (`custom.partner_id`) con
 * l'indirizzo più usato accanto.
 */
export function attesiDaiProdotti(
  prodotti: {
    negozioNome: string | null;
    metafieldShopify: unknown;
    partnerIdShopify?: string | null;
    partnerInsegna?: string | null;
    pubblicazioni: { negozio: string }[];
  }[]
): {
  attesiPerNegozio: Record<string, Record<string, { quota: number; tipico: string | null }>>;
  partnerNoti: Record<string, { id: string; indirizzo: string; insegna: string | null; prodotti: number }[]>;
} {
  const totale = new Map<string, number>();
  const perChiave = new Map<string, Map<string, Map<string, number>>>(); // sito → chiave → valore → n
  const partner = new Map<string, Map<string, Map<string, number>>>(); // sito → id → indirizzo → n
  for (const p of prodotti) {
    const mf = p.metafieldShopify && typeof p.metafieldShopify === "object" && !Array.isArray(p.metafieldShopify) ? (p.metafieldShopify as Record<string, unknown>) : null;
    if (!mf) continue;
    const siti = p.pubblicazioni.length ? p.pubblicazioni.map((x) => x.negozio) : p.negozioNome ? [p.negozioNome] : [];
    for (const sito of new Set(siti)) {
      totale.set(sito, (totale.get(sito) ?? 0) + 1);
      const chiavi = perChiave.get(sito) ?? new Map<string, Map<string, number>>();
      perChiave.set(sito, chiavi);
      for (const [k, v] of Object.entries(mf)) {
        if (v == null || String(v).trim() === "") continue;
        const valori = chiavi.get(k) ?? new Map<string, number>();
        chiavi.set(k, valori);
        valori.set(String(v), (valori.get(String(v)) ?? 0) + 1);
      }
      const id = mf["custom.partner_id"] != null ? String(mf["custom.partner_id"]).trim() : "";
      if (id) {
        const ids = partner.get(sito) ?? new Map<string, Map<string, number>>();
        partner.set(sito, ids);
        const indirizzi = ids.get(id) ?? new Map<string, number>();
        ids.set(id, indirizzi);
        const ind = mf["custom.partner_address"] != null ? String(mf["custom.partner_address"]).trim() : "";
        indirizzi.set(ind, (indirizzi.get(ind) ?? 0) + 1);
      }
    }
  }
  const piuUsato = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  const attesiPerNegozio: Record<string, Record<string, { quota: number; tipico: string | null }>> = {};
  for (const [sito, chiavi] of perChiave) {
    const tot = totale.get(sito) ?? 0;
    attesiPerNegozio[sito] = {};
    for (const [k, valori] of chiavi) {
      const n = [...valori.values()].reduce((a, b) => a + b, 0);
      const top = piuUsato(valori);
      attesiPerNegozio[sito][k] = { quota: tot ? n / tot : 0, tipico: top ? top[0] : null };
    }
  }
  // ⭐ 11/09/2026: i nomi che conosciamo, imparati dai prodotti che portano sia
  // l'id numerico del partner sia la sua insegna (li mandano quelli nati dalla
  // piattaforma). ⚠️ Sono pochi: finché l'app delivery non manda l'id numerico
  // insieme all'insegna (contratto §3.1), la maggior parte dei partner storici
  // resta senza nome, e allora si mostra l'id — meglio un numero che un nome
  // sbagliato.
  const insegnaPerId = new Map<string, string>();
  for (const p of prodotti) {
    if (p.partnerIdShopify && p.partnerInsegna && !insegnaPerId.has(p.partnerIdShopify)) {
      insegnaPerId.set(p.partnerIdShopify, p.partnerInsegna);
    }
  }
  const partnerNoti: Record<string, { id: string; indirizzo: string; insegna: string | null; prodotti: number }[]> = {};
  for (const [sito, ids] of partner) {
    partnerNoti[sito] = [...ids.entries()]
      .map(([id, indirizzi]) => ({
        id,
        indirizzo: piuUsato(indirizzi)?.[0] ?? "",
        insegna: insegnaPerId.get(id) ?? null,
        prodotti: [...indirizzi.values()].reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.prodotti - a.prodotti || a.id.localeCompare(b.id));
  }
  return { attesiPerNegozio, partnerNoti };
}

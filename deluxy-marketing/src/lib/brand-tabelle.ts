import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/db";
import {
  areaDaLocalitaGoogle,
  areaDaOrdine,
  areaDaRegioneMeta,
  canalePagatoDiOrdine,
  type Area,
} from "@/lib/aree";
import { leggiSpesaPerRegioneMeta } from "@/lib/meta";
import type { Periodo } from "@/lib/periodo";
import { deduciLegame } from "@/lib/vendite-campagna";

// Le due letture trasversali della dashboard di brand: **per categoria di
// prodotto** e **per area**.
//
// PERCHÉ SERVONO. La dashboard sapeva dire quanto si spende su Google e quanto
// su Meta, e quanto incassa il brand in tutto. Non sapeva dire la cosa per cui
// si sposta il budget: *quale prodotto* e *quale città* ripagano. Con un ROAS
// di brand a 3× si può avere i fiori a 6× e le torte a 0,8×, e finché si
// guarda la media si continua a pagare per le torte.
//
// ⚠️ TRE INCASSI DIVERSI, TENUTI SEPARATI APPOSTA:
//   · `incasso` — quello che Shopify ha incassato su quella categoria/area, da
//     TUTTE le provenienze (anche organico e diretto). È il fatto.
//   · `incassoGoogle` / `incassoMeta` — la parte di quell'incasso che Shopify
//     attribuisce a Google o a Meta (`Ordine.origine`, che arriva da Deluxy
//     Orders). È una **stima**: l'attribuzione last-click di Shopify non sa
//     nulla del contributo di una campagna vista e non cliccata.
//   · i ricavi che la piattaforma si attribuisce (`MetricaCampagna.ricavi`)
//     NON entrano in queste tabelle: sono di parte, e la somma dei canali può
//     superare le vendite vere. Chi li vuole li ha nella tabella per canale.

// ============================= CATEGORIE =============================

export type RigaCategoria = {
  categoria: string;
  // dal registro ordini
  incasso: number;
  ordini: number;
  // dalla pubblicità, canale per canale
  spesaGoogle: number;
  spesaMeta: number;
  campagne: number;
  campagneSenzaScelta: number;
  // la parte di incasso che Shopify attribuisce al canale
  incassoGoogle: number;
  incassoMeta: number;
};

export type TabellaCategorie = {
  righe: RigaCategoria[];
  // La spesa delle campagne «generico»: non appartiene a nessuna categoria e
  // non si spalma, o i ROAS di riga sarebbero tutti sbagliati insieme.
  generico: { spesaGoogle: number; spesaMeta: number; campagne: number };
  // Gli ordini che Shopify non attribuisce a nessun canale a pagamento.
  incassoNonAttribuito: number;
  totali: {
    incasso: number;
    spesa: number;
    spesaGoogle: number;
    spesaMeta: number;
    incassoGoogle: number;
    incassoMeta: number;
  };
};

export async function perCategoria(brand: string, p: Periodo): Promise<TabellaCategorie> {
  const [campagne, spese, ordini] = await Promise.all([
    // ⚠️ La categoria di una campagna NON e' un campo nuovo: sta in
    // `LegameCampagnaShopify`, dove l'app la deduce dal nome e la lascia
    // correggere a mano dalla scheda campagna (`origine: "manuale"`, che non
    // viene mai sovrascritta). Qui si legge quella, e per le campagne che non
    // hanno ancora il legame si deduce a memoria con la STESSA funzione —
    // senza scrivere niente: una dashboard che apre e scrive 237 righe per
    // mostrare una tabella e' un effetto collaterale che nessuno si aspetta.
    prisma.campagna.findMany({
      where: { brand },
      select: {
        id: true,
        nome: true,
        brand: true,
        canale: true,
        legameShopify: { select: { categoria: true, origine: true } },
      },
    }),
    prisma.metricaCampagna.groupBy({
      by: ["campagnaId"],
      where: { data: { gte: p.da, lt: p.a }, campagna: { brand } },
      _sum: { spesa: true },
    }),
    prisma.ordine.findMany({
      // Fuori annullati e rimborsati, come in tutta l'app: i primi non sono
      // mai entrati, i secondi sono tornati indietro.
      where: { brand, data: { gte: p.da, lt: p.a }, stato: { notIn: ["annullato", "rimborsato"] } },
      select: {
        origine: true,
        utmSource: true,
        righe: { select: { categoria: true, totale: true } },
      },
    }),
  ]);

  const spesaDi = new Map(spese.map((s) => [s.campagnaId, s._sum.spesa ?? 0]));
  const righe = new Map<string, RigaCategoria>();
  const vuota = (categoria: string): RigaCategoria => ({
    categoria,
    incasso: 0,
    ordini: 0,
    spesaGoogle: 0,
    spesaMeta: 0,
    campagne: 0,
    campagneSenzaScelta: 0,
    incassoGoogle: 0,
    incassoMeta: 0,
  });
  const prendi = (k: string) => {
    const r = righe.get(k) ?? vuota(k);
    righe.set(k, r);
    return r;
  };

  const generico = { spesaGoogle: 0, spesaMeta: 0, campagne: 0 };

  // 1) la spesa, categoria per categoria
  for (const c of campagne) {
    const spesa = spesaDi.get(c.id) ?? 0;
    // ⚠️ Una campagna senza spesa nel periodo non si conta: comparirebbe come
    // «3 campagne» su una riga in cui nessuna ha erogato un centesimo.
    if (spesa <= 0) continue;
    // Tre casi, e vanno tenuti distinti:
    //  · legame a mano        -> quello che ha scelto una persona, e basta;
    //  · legame dedotto       -> la deduzione gia' salvata;
    //  · nessun legame ancora -> si deduce qui, a memoria.
    // `categoria: null` vuol dire «non parla di una famiglia sola»: e' il
    // generico, e se la scelta e' manuale e' una DECISIONE, non un'assenza.
    const legame = c.legameShopify;
    const categoria = legame ? legame.categoria : deduciLegame(c).categoria;
    const scelta = legame?.origine === "manuale";
    const dove = categoria == null ? null : prendi(categoria);
    if (dove == null) {
      if (c.canale === "meta_ads") generico.spesaMeta += spesa;
      else generico.spesaGoogle += spesa;
      generico.campagne++;
      continue;
    }
    if (c.canale === "meta_ads") dove.spesaMeta += spesa;
    else dove.spesaGoogle += spesa;
    dove.campagne++;
    if (!scelta) dove.campagneSenzaScelta++;
  }

  // 2) l'incasso, riga d'ordine per riga d'ordine
  let incassoNonAttribuito = 0;
  for (const o of ordini) {
    const canale = canalePagatoDiOrdine(o);
    // Un ordine con righe di categorie diverse conta una volta per ciascuna
    // categoria toccata: «ordini» qui vuol dire «ordini che contenevano
    // questa categoria», non una quota inventata dell'ordine.
    const toccate = new Set<string>();
    for (const r of o.righe) {
      const k = r.categoria ?? "altro";
      const t = r.totale ?? 0;
      const riga = prendi(k);
      riga.incasso += t;
      toccate.add(k);
      if (canale === "google_ads") riga.incassoGoogle += t;
      else if (canale === "meta_ads") riga.incassoMeta += t;
      else incassoNonAttribuito += t;
    }
    for (const k of toccate) prendi(k).ordini++;
  }

  const elenco = [...righe.values()]
    .filter((r) => r.incasso > 0 || r.spesaGoogle > 0 || r.spesaMeta > 0)
    .sort((a, b) => b.incasso - a.incasso || b.spesaGoogle + b.spesaMeta - (a.spesaGoogle + a.spesaMeta));

  return {
    righe: elenco,
    generico,
    incassoNonAttribuito,
    totali: {
      incasso: elenco.reduce((s, r) => s + r.incasso, 0),
      // ⚠️ La spesa delle generiche entra nel totale: è uscita davvero, e un
      // totale che la salta non tornerebbe con la spesa ADV in cima alla
      // pagina — due numeri diversi per la stessa cosa nella stessa schermata.
      spesa:
        elenco.reduce((s, r) => s + r.spesaGoogle + r.spesaMeta, 0) + generico.spesaGoogle + generico.spesaMeta,
      spesaGoogle: elenco.reduce((s, r) => s + r.spesaGoogle, 0) + generico.spesaGoogle,
      spesaMeta: elenco.reduce((s, r) => s + r.spesaMeta, 0) + generico.spesaMeta,
      incassoGoogle: elenco.reduce((s, r) => s + r.incassoGoogle, 0),
      incassoMeta: elenco.reduce((s, r) => s + r.incassoMeta, 0),
    },
  };
}

// =============================== AREE ===============================

export type RigaArea = {
  area: string;
  incasso: number;
  ordini: number;
  spesaGoogle: number;
  spesaMeta: number;
  campagneGoogle: number;
  incassoGoogle: number;
  incassoMeta: number;
};

export type TabellaAree = {
  righe: RigaArea[];
  // La spesa Google che non si può assegnare a una città: campagne che tirano
  // su più aree («Brand Protection» su Milano+Roma+Firenze) o su tutta Italia,
  // e campagne senza località censite.
  nonRipartibile: { spesa: number; campagne: number; nazionale: number; senzaLocalita: number };
  // Gli ordini di cui non sappiamo la destinazione.
  nonNota: { incasso: number; ordini: number };
  erroreMeta: string | null;
  metaLetta: boolean;
  totali: {
    incasso: number;
    spesa: number;
    spesaGoogle: number;
    spesaMeta: number;
    incassoGoogle: number;
    incassoMeta: number;
  };
};

const regioniMeta = (account: string, dal: string, al: string) =>
  unstable_cache(
    () => leggiSpesaPerRegioneMeta(account, dal, al),
    ["meta-regioni", account, dal, al],
    { revalidate: 1800, tags: ["meta-regioni"] }
  )();

export async function perArea(brand: string, p: Periodo, idAccountMeta: string[]): Promise<TabellaAree> {
  const giorno = (d: Date) => d.toISOString().slice(0, 10);
  // `p.a` è esclusiva, il time_range di Meta è inclusivo: senza il giorno
  // indietro si chiederebbe un giorno in più di quello mostrato in cima.
  const al = new Date(p.a.getTime() - 86_400_000);

  const [campagne, spese, ordini, regioni] = await Promise.all([
    prisma.campagna.findMany({
      where: { brand },
      select: { id: true, canale: true, localita: { select: { nome: true } } },
    }),
    prisma.metricaCampagna.groupBy({
      by: ["campagnaId"],
      where: { data: { gte: p.da, lt: p.a }, campagna: { brand } },
      _sum: { spesa: true },
    }),
    prisma.ordine.findMany({
      where: { brand, data: { gte: p.da, lt: p.a }, stato: { notIn: ["annullato", "rimborsato"] } },
      select: { totale: true, provincia: true, citta: true, origine: true, utmSource: true },
    }),
    // La spesa Meta per regione, letta viva. Se non arriva, la colonna Meta si
    // dichiara vuota: non si finge uno zero.
    //
    // ⚠️ Sotto cache di mezz'ora, per account e per periodo: è una chiamata
    // alla Graph API dentro una dashboard che si apre venti volte al giorno, e
    // la spesa di ieri non cambia. Senza, ogni apertura pagava tre chiamate a
    // Meta prima di mostrare una riga.
    Promise.all(idAccountMeta.map((a) => regioniMeta(a, giorno(p.da), giorno(al)))),
  ]);

  const spesaDi = new Map(spese.map((s) => [s.campagnaId, s._sum.spesa ?? 0]));
  const righe = new Map<string, RigaArea>();
  const prendi = (k: string) => {
    const r =
      righe.get(k) ??
      ({
        area: k,
        incasso: 0,
        ordini: 0,
        spesaGoogle: 0,
        spesaMeta: 0,
        campagneGoogle: 0,
        incassoGoogle: 0,
        incassoMeta: 0,
      } as RigaArea);
    righe.set(k, r);
    return r;
  };

  const nonRipartibile = { spesa: 0, campagne: 0, nazionale: 0, senzaLocalita: 0 };

  // 1) la spesa Google, dedotta da dove tira la campagna
  for (const c of campagne) {
    const spesa = spesaDi.get(c.id) ?? 0;
    if (spesa <= 0) continue;
    if (c.canale === "meta_ads") continue; // Meta arriva dalle regioni, sotto
    const area = areaDaLocalitaGoogle(c.localita.map((l) => l.nome));
    if (area == null || area === "nazionale") {
      nonRipartibile.spesa += spesa;
      nonRipartibile.campagne++;
      if (area === "nazionale") nonRipartibile.nazionale++;
      else if (c.localita.length === 0) nonRipartibile.senzaLocalita++;
      continue;
    }
    const r = prendi(area);
    r.spesaGoogle += spesa;
    r.campagneGoogle++;
  }

  // 2) la spesa Meta, dalle regioni
  //
  // ⚠️ Le regioni arrivano per ACCOUNT, non per campagna: gli account Meta
  // sono uno per brand, quindi la somma è già la spesa di questo brand. Se un
  // account ospitasse due brand questa colonna sarebbe sbagliata, e va
  // riguardata prima di fidarsi.
  const erroreMeta = regioni.map((r) => r.errore).find((e) => e != null) ?? null;
  const metaLetta = regioni.some((r) => r.errore == null);
  for (const lettura of regioni) {
    for (const r of lettura.righe) {
      if (r.spesa <= 0) continue;
      prendi(areaDaRegioneMeta(r.regione)).spesaMeta += r.spesa;
    }
  }

  // 3) l'incasso, ordine per ordine
  const nonNota = { incasso: 0, ordini: 0 };
  for (const o of ordini) {
    const t = o.totale ?? 0;
    const a = areaDaOrdine(o);
    if (a === "nonNota") {
      nonNota.incasso += t;
      nonNota.ordini++;
      continue;
    }
    const r = prendi(a);
    r.incasso += t;
    r.ordini++;
    const canale = canalePagatoDiOrdine(o);
    if (canale === "google_ads") r.incassoGoogle += t;
    else if (canale === "meta_ads") r.incassoMeta += t;
  }

  const ordine: Record<string, number> = { milano: 0, roma: 1, firenze: 2, altro: 3 };
  const elenco = [...righe.values()]
    .filter((r) => r.incasso > 0 || r.spesaGoogle > 0 || r.spesaMeta > 0)
    .sort((a, b) => (ordine[a.area] ?? 9) - (ordine[b.area] ?? 9));

  return {
    righe: elenco,
    nonRipartibile,
    nonNota,
    erroreMeta,
    metaLetta,
    totali: {
      incasso: elenco.reduce((s, r) => s + r.incasso, 0) + nonNota.incasso,
      spesa: elenco.reduce((s, r) => s + r.spesaGoogle + r.spesaMeta, 0) + nonRipartibile.spesa,
      spesaGoogle: elenco.reduce((s, r) => s + r.spesaGoogle, 0) + nonRipartibile.spesa,
      spesaMeta: elenco.reduce((s, r) => s + r.spesaMeta, 0),
      incassoGoogle: elenco.reduce((s, r) => s + r.incassoGoogle, 0),
      incassoMeta: elenco.reduce((s, r) => s + r.incassoMeta, 0),
    },
  };
}

/** Il ROAS di una riga, o `null` quando la spesa è zero: dividere per zero non è «infinito», è «non calcolabile». */
export function resa(incasso: number, spesa: number): number | null {
  return spesa > 0 ? incasso / spesa : null;
}

export type { Area };

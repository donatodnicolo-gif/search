"use server";

import { chiediAllAi } from "@/lib/ai";
import { regoleDiBrand } from "@/lib/copy-lint";
import { prisma } from "@/lib/db";
import { ETICHETTA_BRAND } from "@/lib/dominio";
import { breakEvenRoas } from "@/lib/guardrail";

// «Chiedi un brief all'AI»: si descrive a parole la campagna che si vuole e
// l'AI compila il modulo — nome, obiettivo, budget, località, URL, keyword,
// negative, titoli e descrizioni.
//
// ⚠️ COMPILA IL MODULO, NON CREA LA CAMPAGNA. Da qui non parte niente: i campi
// si riempiono, la persona li rilegge e li corregge, poi il modulo passa dai
// controlli che c'erano già (lint 7.2/7.3, limiti di Google) e finisce in coda,
// dove qualcuno approva. I tre cancelli restano tutti: l'AI propone, la persona
// sceglie, la coda approva. Cambiare questo ordine vorrebbe dire far scrivere a
// un modello dentro un account pubblicitario vero.

export type BriefCampagna = {
  nome: string;
  obiettivoTipo: string;
  budget: number;
  lingua: string;
  localita: string[];
  finalUrl: string;
  gruppo: string;
  keywords: { testo: string; corrispondenza: string }[];
  negative: string[];
  titoli: string[];
  descrizioni: string[];
  motivo: string;
};

export type EsitoBrief =
  | { ok: true; brief: BriefCampagna; note: string | null; scartati: string[]; modello: string }
  | { ok: false; errore: string };

// ⚠️ SCHEMA MINIMO, DI PROPOSITO. L'API di Claude RIFIUTA `maxItems` e i vincoli
// di lunghezza negli structured outputs: mettendoli si prende un 400 alla prima
// chiamata. I limiti veri (15 titoli, 30 caratteri, 4 descrizioni, 90 caratteri)
// si impongono nel codice qui sotto, dove tra l'altro si può anche DIRE cosa è
// stato scartato invece di far sparire le righe in silenzio.
const SCHEMA_BRIEF = {
  type: "object",
  additionalProperties: false,
  required: ["nome", "obiettivoTipo", "budget", "keywords", "titoli", "descrizioni"],
  properties: {
    nome: { type: "string" },
    obiettivoTipo: { type: "string" },
    budget: { type: "number" },
    lingua: { type: "string" },
    localita: { type: "array", items: { type: "string" } },
    finalUrl: { type: "string" },
    gruppo: { type: "string" },
    keywords: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["testo", "corrispondenza"],
        properties: { testo: { type: "string" }, corrispondenza: { type: "string" } },
      },
    },
    negative: { type: "array", items: { type: "string" } },
    titoli: { type: "array", items: { type: "string" } },
    descrizioni: { type: "array", items: { type: "string" } },
    motivo: { type: "string" },
    note: { type: "string" },
  },
} as const;

const OBIETTIVI_AMMESSI = ["vendite", "contatti", "traffico", "notorieta"];
const MATCH_AMMESSI = ["exact", "phrase", "broad"];

// ——— Il brief per una campagna META ———
// Stessa filosofia: l'AI COMPILA il modulo Meta, non lancia niente. Il
// contesto sono le campagne Meta già vive del brand e le regole di tono.

export type BriefCampagnaMeta = {
  nome: string;
  obiettivoTipo: string; // vendite | contatti | traffico | notorieta
  budget: number;
  livelloBudget: string; // campagna | adset
  strategia: string; // volume | costo_cap | bid_cap | roas_min
  paesi: string[]; // ISO-2
  citta: string[]; // righe «Nome | raggio km»
  etaMin: number;
  etaMax: number;
  genere: string; // tutti | donne | uomini
  testi: string[];
  titolo: string;
  descrizione: string;
  cta: string;
  finalUrl: string;
  motivo: string;
};

export type EsitoBriefMeta =
  | { ok: true; brief: BriefCampagnaMeta; note: string | null; scartati: string[]; modello: string }
  | { ok: false; errore: string };

const SCHEMA_BRIEF_META = {
  type: "object",
  additionalProperties: false,
  required: ["nome", "obiettivoTipo", "budget", "testi", "titolo"],
  properties: {
    nome: { type: "string" },
    obiettivoTipo: { type: "string" },
    budget: { type: "number" },
    livelloBudget: { type: "string" },
    strategia: { type: "string" },
    paesi: { type: "array", items: { type: "string" } },
    citta: { type: "array", items: { type: "string" } },
    etaMin: { type: "number" },
    etaMax: { type: "number" },
    genere: { type: "string" },
    testi: { type: "array", items: { type: "string" } },
    titolo: { type: "string" },
    descrizione: { type: "string" },
    cta: { type: "string" },
    finalUrl: { type: "string" },
    motivo: { type: "string" },
    note: { type: "string" },
  },
} as const;

const CTA_AMMESSE = ["SHOP_NOW", "ORDER_NOW", "LEARN_MORE", "GET_OFFER", "CONTACT_US"];

export async function proponiBriefCampagnaMeta(input: {
  descrizione: string;
  brand: string;
}): Promise<EsitoBriefMeta> {
  const descrizione = String(input.descrizione ?? "").trim();
  if (descrizione.length < 10) {
    return { ok: false, errore: "Scrivi almeno una frase su cosa deve fare questa campagna." };
  }
  const brand = input.brand || "gifts";

  const campagne = await prisma.campagna.findMany({
    where: { brand, canale: "meta_ads", stato: { notIn: ["defunta", "conclusa"] } },
    select: { nome: true, budgetGiornaliero: true, obiettivo: true, stato: true },
    take: 25,
  });

  const esito = await chiediAllAi({
    istruzioni: `Sei un esperto di Meta Ads (Facebook/Instagram) che prepara una campagna per ${ETICHETTA_BRAND[brand] ?? brand}.

Compila il brief a partire dalla richiesta dell'utente. Rispondi SOLO col JSON dello schema.

REGOLE, o il modulo rifiuta il brief:
- "obiettivoTipo": esattamente uno fra vendite, contatti, traffico, notorieta (su Meta decide cosa compra l'asta).
- "livelloBudget": "campagna" (Advantage/CBO, il default giusto) oppure "adset".
- "strategia": volume, costo_cap, bid_cap o roas_min (volume è il default giusto senza indicazioni).
- "paesi": codici ISO-2 maiuscoli (es. "IT"). "citta": righe «Nome | raggio km» (raggio opzionale).
- "etaMin" fra 18 e 65, "etaMax" fra 24 e 65 (65 vale «65 e oltre»). "genere": tutti, donne o uomini.
- "testi": 2-3 varianti di testo principale, le prime ~125 battute reggono da sole (dopo c'è il «altro»).
- "titolo" entro 40 battute, "descrizione" entro 30 (si vede solo su alcuni posizionamenti).
- "cta": una fra SHOP_NOW, ORDER_NOW, LEARN_MORE, GET_OFFER, CONTACT_US.
- "nome" segue lo stile dei nomi già in uso sul brand. "motivo" è una riga per lo storico.
- "budget" in euro al giorno.

TONO E CLAIM per ${ETICHETTA_BRAND[brand] ?? brand} — vincoli veri, il modulo blocca chi li viola:
${regoleDiBrand(brand).map((r) => `- ${r}`).join("\n") || "- nessuna regola specifica per questo brand"}

Il break-even del brand è ${breakEvenRoas(brand).toFixed(2).replace(".", ",")}×.`,
    dati: {
      richiestaDellUtente: descrizione,
      brand,
      campagneMetaGiaAttive: campagne,
    },
    schema: SCHEMA_BRIEF_META,
    massimoToken: 3000,
  });

  if (!esito.ok) return { ok: false, errore: esito.errore };
  let grezzo: Record<string, unknown>;
  try {
    grezzo = JSON.parse(esito.testo) as Record<string, unknown>;
  } catch {
    return { ok: false, errore: "L'AI ha risposto in una forma non leggibile: riprova." };
  }

  const scartati: string[] = [];
  const testiPuliti = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];

  const obiettivoGrezzo = String(grezzo.obiettivoTipo ?? "").toLowerCase();
  const obiettivoTipo = OBIETTIVI_AMMESSI.includes(obiettivoGrezzo) ? obiettivoGrezzo : "vendite";
  if (obiettivoGrezzo && obiettivoTipo !== obiettivoGrezzo) {
    scartati.push(`obiettivo «${obiettivoGrezzo}» non riconosciuto: messo «vendite», controllalo`);
  }
  const strategia = ["volume", "costo_cap", "bid_cap", "roas_min"].includes(String(grezzo.strategia ?? ""))
    ? String(grezzo.strategia)
    : "volume";
  const cta = CTA_AMMESSE.includes(String(grezzo.cta ?? "")) ? String(grezzo.cta) : "SHOP_NOW";
  const budget = Number(grezzo.budget);
  const etaMin = Math.min(65, Math.max(18, Number(grezzo.etaMin) || 18));
  const etaMax = Math.min(65, Math.max(etaMin, Number(grezzo.etaMax) || 65));
  const titolo = String(grezzo.titolo ?? "").trim();
  if (titolo.length > 40) scartati.push("titolo oltre le 40 battute consigliate: accorcialo");

  return {
    ok: true,
    brief: {
      nome: String(grezzo.nome ?? "").trim(),
      obiettivoTipo,
      budget: Number.isFinite(budget) && budget > 0 ? budget : 15,
      livelloBudget: String(grezzo.livelloBudget ?? "campagna") === "adset" ? "adset" : "campagna",
      strategia,
      paesi: testiPuliti(grezzo.paesi).map((x) => x.toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)),
      citta: testiPuliti(grezzo.citta),
      etaMin,
      etaMax,
      genere: ["tutti", "donne", "uomini"].includes(String(grezzo.genere ?? "")) ? String(grezzo.genere) : "tutti",
      testi: testiPuliti(grezzo.testi).slice(0, 5),
      titolo,
      descrizione: String(grezzo.descrizione ?? "").trim(),
      cta,
      finalUrl: String(grezzo.finalUrl ?? "").trim(),
      motivo: String(grezzo.motivo ?? "").trim(),
    },
    note: grezzo.note ? String(grezzo.note) : null,
    scartati,
    modello: esito.modello,
  };
}

// ——— Il brief per un GRUPPO NUOVO dentro una campagna che esiste già ———
// Stessa filosofia del brief campagna: l'AI COMPILA il modulo, non crea
// niente. Il contesto però è la CAMPAGNA: i gruppi che ha già (per non
// doppiarli e per lo stile dei nomi), le sue keyword che rendono, le sue
// destinazioni.

export type BriefGruppo = {
  gruppo: string;
  keywords: { testo: string; corrispondenza: string }[];
  titoli: string[];
  descrizioni: string[];
  finalUrl: string;
  motivo: string;
};

export type EsitoBriefGruppo =
  | { ok: true; brief: BriefGruppo; note: string | null; scartati: string[]; modello: string }
  | { ok: false; errore: string };

// Stesso principio dello SCHEMA_BRIEF: minimo, i tetti si impongono nel codice.
const SCHEMA_BRIEF_GRUPPO = {
  type: "object",
  additionalProperties: false,
  required: ["gruppo", "keywords", "titoli", "descrizioni"],
  properties: {
    gruppo: { type: "string" },
    keywords: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["testo", "corrispondenza"],
        properties: { testo: { type: "string" }, corrispondenza: { type: "string" } },
      },
    },
    titoli: { type: "array", items: { type: "string" } },
    descrizioni: { type: "array", items: { type: "string" } },
    finalUrl: { type: "string" },
    motivo: { type: "string" },
    note: { type: "string" },
  },
} as const;

export async function proponiBriefGruppo(input: {
  descrizione: string;
  campagnaId: string;
}): Promise<EsitoBriefGruppo> {
  const descrizione = String(input.descrizione ?? "").trim();
  if (descrizione.length < 10) {
    return { ok: false, errore: "Scrivi almeno una frase su cosa deve coprire questo gruppo." };
  }
  const campagna = await prisma.campagna.findUnique({
    where: { id: String(input.campagnaId ?? "") },
    select: { id: true, nome: true, brand: true, canale: true, obiettivo: true },
  });
  if (!campagna) return { ok: false, errore: "Campagna non trovata." };
  if (campagna.canale !== "google_ads") {
    return { ok: false, errore: "I gruppi di annunci con keyword esistono su Google Ads: su Meta il pubblico si costruisce in Ads Manager." };
  }

  const [gruppi, keywordChe, destinazioni] = await Promise.all([
    prisma.gruppo.findMany({
      where: { campagnaId: campagna.id },
      select: { nome: true, stato: true },
      take: 30,
    }),
    prisma.copyAnnuncio.findMany({
      where: { tipo: "keyword", stato: { not: "defunta" }, campagna: campagna.nome },
      orderBy: { incasso: { sort: "desc", nulls: "last" } },
      take: 20,
      select: { testo: true, spesa: true, incasso: true, conversioni: true },
    }),
    prisma.copyAnnuncio.findMany({
      where: { tipo: "destinazione", finalUrl: { not: null }, campagna: campagna.nome },
      orderBy: { spesa: { sort: "desc", nulls: "last" } },
      take: 8,
      select: { finalUrl: true },
    }),
  ]);

  const esito = await chiediAllAi({
    istruzioni: `Sei un esperto di Google Ads. Devi preparare un NUOVO GRUPPO DI ANNUNCI dentro la campagna «${campagna.nome}» di ${ETICHETTA_BRAND[campagna.brand] ?? campagna.brand} (obiettivo: ${campagna.obiettivo ?? "non dichiarato"}).

Compila il brief del gruppo a partire dalla richiesta dell'utente. Rispondi SOLO con il JSON dello schema.

REGOLE, o il modulo rifiuta il brief:
- "gruppo" è il nome del nuovo gruppo: DEVE essere diverso dai gruppi già esistenti (li ricevi nei dati) e coerente col loro stile.
- "corrispondenza" di ogni keyword deve essere exact, phrase o broad. Le keyword devono essere COERENTI fra loro: un gruppo = un intento di ricerca.
- ESATTAMENTE 15 titoli, ognuno di 30 caratteri O MENO (contali: 31 = buttato). Google ne accetta al massimo 15 e il giudizio «Eccellente» li vuole tutti.
- ESATTAMENTE 4 descrizioni, ognuna di 90 caratteri O MENO.

GIUDIZIO GOOGLE (Ad Strength) — l'annuncio deve puntare a «Eccellente»:
- Le keyword del gruppo compaiono TESTUALI in almeno 5 dei 15 titoli, in modo naturale.
- Ogni titolo dice una cosa DIVERSA (beneficio, servizio, brand, città, consegna, qualità, invito all'azione): due titoli quasi uguali contano come ridondanza e ABBASSANO il giudizio.
- La maggior parte dei titoli fra 20 e 30 caratteri, 2-3 corti (sotto i 20) per i posizionamenti stretti.
- Le 4 descrizioni PIENE (70-90 caratteri), ognuna con un angolo diverso, almeno una con un invito all'azione chiaro.
- "finalUrl" è la pagina di destinazione: coerente con l'intento del gruppo, scelta fra quelle già in uso se una combacia.
- "motivo" è una riga sul perché questo gruppo esiste, per lo storico.

TONO E CLAIM per ${ETICHETTA_BRAND[campagna.brand] ?? campagna.brand} — vincoli veri, il modulo blocca chi li viola:
${regoleDiBrand(campagna.brand).map((r) => `- ${r}`).join("\n") || "- nessuna regola specifica per questo brand"}`,
    dati: {
      richiestaDellUtente: descrizione,
      campagna: { nome: campagna.nome, obiettivo: campagna.obiettivo },
      gruppiGiaEsistenti: gruppi.map((g) => ({ nome: g.nome, stato: g.stato })),
      keywordCheRendonoDiPiu: keywordChe,
      destinazioniGiaInUso: destinazioni.map((d) => d.finalUrl),
    },
    schema: SCHEMA_BRIEF_GRUPPO,
    massimoToken: 4000,
  });

  if (!esito.ok) return { ok: false, errore: esito.errore };

  let grezzo: Record<string, unknown>;
  try {
    grezzo = JSON.parse(esito.testo) as Record<string, unknown>;
  } catch {
    return { ok: false, errore: "L'AI ha risposto in una forma non leggibile: riprova." };
  }

  // Stessi tetti del brief campagna, imposti QUI e dichiarati.
  const scartati: string[] = [];
  const testi = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];

  const titoliTutti = testi(grezzo.titoli);
  const titoli = titoliTutti.filter((t) => t.length <= 30).slice(0, 15);
  const titoliLunghi = titoliTutti.filter((t) => t.length > 30);
  if (titoliLunghi.length > 0) {
    scartati.push(`${titoliLunghi.length} titol${titoliLunghi.length === 1 ? "o" : "i"} oltre i 30 caratteri (es. «${titoliLunghi[0].slice(0, 45)}…»)`);
  }
  const descrizioniTutte = testi(grezzo.descrizioni);
  const descrizioni = descrizioniTutte.filter((d) => d.length <= 90).slice(0, 4);
  const descrizioniLunghe = descrizioniTutte.filter((d) => d.length > 90);
  if (descrizioniLunghe.length > 0) {
    scartati.push(`${descrizioniLunghe.length} descrizion${descrizioniLunghe.length === 1 ? "e" : "i"} oltre i 90 caratteri`);
  }

  const nomeGruppo = String(grezzo.gruppo ?? "").trim();
  const giaEsiste = gruppi.some((g) => g.nome.trim().toLowerCase() === nomeGruppo.toLowerCase());
  if (giaEsiste) {
    scartati.push(`il nome «${nomeGruppo}» esiste già nella campagna: cambialo prima di accodare`);
  }
  if (titoli.length > 0 && titoli.length < 15) {
    scartati.push(`titoli ${titoli.length} su 15: per il giudizio «Eccellente» servono tutti — completa a mano o rifai il brief`);
  }
  if (descrizioni.length > 0 && descrizioni.length < 4) {
    scartati.push(`descrizioni ${descrizioni.length} su 4`);
  }

  const keywords = (Array.isArray(grezzo.keywords) ? grezzo.keywords : [])
    .map((k) => {
      const o = k as Record<string, unknown>;
      const m = String(o.corrispondenza ?? "broad").toLowerCase();
      return { testo: String(o.testo ?? "").trim(), corrispondenza: MATCH_AMMESSI.includes(m) ? m : "broad" };
    })
    .filter((k) => k.testo);

  return {
    ok: true,
    brief: {
      gruppo: nomeGruppo,
      keywords,
      titoli,
      descrizioni,
      finalUrl: String(grezzo.finalUrl ?? "").trim(),
      motivo: String(grezzo.motivo ?? "").trim(),
    },
    note: grezzo.note ? String(grezzo.note) : null,
    scartati,
    modello: esito.modello,
  };
}

export async function proponiBriefCampagna(input: {
  descrizione: string;
  brand: string;
}): Promise<EsitoBrief> {
  const descrizione = String(input.descrizione ?? "").trim();
  if (descrizione.length < 10) {
    return { ok: false, errore: "Scrivi almeno una frase su cosa deve fare questa campagna." };
  }
  const brand = input.brand || "gifts";

  // Il brief nasce su quello che quel brand già fa, non nel vuoto: nomi delle
  // campagne vive (per lo stile del nome e per non doppiarne una), le keyword
  // che rendono davvero e le destinazioni già in uso.
  //
  // ⚠️ `nulls: "last"` su ogni ordinamento per spesa: su Postgres `DESC` mette
  // i NULL PRIMI, e senza questo il `take` pescherebbe proprio le righe senza
  // numeri — l'AI riceverebbe le parole di cui non sappiamo niente.
  // ⚠️ PRIMA le campagne del brand, POI il resto filtrato sui loro nomi.
  // `CopyAnnuncio` non ha il brand: si aggancia alla campagna per NOME, quindi
  // senza questo elenco le due query qui sotto guardano l'archivio intero —
  // 21.052 keyword e 1.056 destinazioni di tutti e tre i marchi. Non era solo
  // lento: l'AI riceveva le parole di Gifts mentre scriveva una campagna
  // Flowers, cioè esempi del marchio sbagliato spacciati per «quello che
  // funziona da noi».
  const campagne = await prisma.campagna.findMany({
    where: { brand, canale: "google_ads", stato: { notIn: ["defunta", "conclusa"] } },
    select: { nome: true, budgetGiornaliero: true, obiettivo: true },
    take: 25,
  });
  const nomiCampagne = campagne.map((c) => c.nome);

  // ⚠️ `nulls: "last"`: su Postgres `ORDER BY … DESC` mette i NULL PRIMI, e
  // senza questo il `take` pescherebbe proprio le righe senza numeri.
  const [keywordChe, destinazioni] = await Promise.all([
    nomiCampagne.length
      ? prisma.copyAnnuncio.findMany({
          where: { tipo: "keyword", stato: { not: "defunta" }, campagna: { in: nomiCampagne } },
          orderBy: { incasso: { sort: "desc", nulls: "last" } },
          take: 20,
          select: { testo: true, spesa: true, incasso: true, conversioni: true, campagna: true },
        })
      : Promise.resolve([]),
    nomiCampagne.length
      ? prisma.copyAnnuncio.findMany({
          where: { tipo: "destinazione", finalUrl: { not: null }, campagna: { in: nomiCampagne } },
          orderBy: { spesa: { sort: "desc", nulls: "last" } },
          take: 10,
          select: { finalUrl: true, campagna: true },
        })
      : Promise.resolve([]),
  ]);

  const esito = await chiediAllAi({
    // Il brief segue il fornitore GLOBALE delle Impostazioni (oggi Claude).
    // Il 26/08 era stato fissato su OpenAI (`fornitore: "openai"`) su
    // richiesta; il 27/08 l'utente è tornato al globale. L'override
    // per-funzione resta disponibile in chiediAllAi, per quando servirà.
    istruzioni: `Sei un esperto di Google Ads che prepara una campagna di ricerca per ${ETICHETTA_BRAND[brand] ?? brand}.

Compila un brief completo a partire dalla richiesta dell'utente. Rispondi SOLO con il JSON dello schema.

REGOLE DA RISPETTARE, altrimenti il modulo rifiuta il brief:
- "obiettivoTipo" deve essere esattamente uno fra: vendite, contatti, traffico, notorieta.
- "lingua" deve essere "ita" oppure "eng". È la lingua in cui sono SCRITTI gli annunci, non quella di chi cerca.
- "corrispondenza" di ogni keyword deve essere exact, phrase o broad.
- ESATTAMENTE 15 titoli, ognuno di 30 caratteri O MENO. Conta i caratteri: un titolo di 31 viene buttato. Google ne accetta al massimo 15 e il giudizio «Eccellente» li vuole tutti.
- ESATTAMENTE 4 descrizioni, ognuna di 90 caratteri O MENO.
- "budget" è un numero in euro al giorno.

GIUDIZIO GOOGLE (Ad Strength) — l'annuncio deve puntare a «Eccellente», e queste sono le leve che Google dichiara di misurare:
- Le keyword più importanti del brief compaiono TESTUALI in almeno 5 dei 15 titoli, in modo naturale.
- Ogni titolo dice una cosa DIVERSA: beneficio, servizio, brand, città, consegna, qualità, prezzo/valore, invito all'azione. Due titoli quasi uguali contano come ridondanza e ABBASSANO il giudizio.
- Sfrutta lo spazio: la maggior parte dei titoli fra 20 e 30 caratteri, 2-3 corti (sotto i 20) per i posizionamenti stretti.
- Le 4 descrizioni PIENE (70-90 caratteri), ognuna con un angolo diverso, almeno una con un invito all'azione chiaro.
- "localita" sono nomi di città o paesi, in italiano (es. "Milano", "Italia").
- "nome" segue lo stile dei nomi già in uso su questo brand. Metti dentro città e lingua quando ha senso: l'app le riconosce dal nome.
- "motivo" è una riga sul perché questa campagna esiste, per lo storico.

TONO E CLAIM per ${ETICHETTA_BRAND[brand] ?? brand} — sono vincoli veri, il modulo blocca chi li viola:
${regoleDiBrand(brand).map((r) => `- ${r}`).join("\n") || "- nessuna regola specifica per questo brand"}

ATTENZIONE all'obiettivo: "vendite" conta gli acquisti e il ROAS si legge davvero; "contatti" è per i lead B2B, dove il valore conversione è simbolico e il ROAS NON va usato come giudizio. Non scegliere "vendite" per una campagna che raccoglie richieste.

Il break-even di questo brand è ${breakEvenRoas(brand).toFixed(2).replace(".", ",")}×: un budget che non permette abbastanza clic per imparare è sprecato.`,
    dati: {
      richiestaDellUtente: descrizione,
      brand,
      campagneGiaAttive: campagne.map((c) => ({
        nome: c.nome,
        budget: c.budgetGiornaliero,
        obiettivo: c.obiettivo,
      })),
      keywordCheRendonoDiPiu: keywordChe.map((k) => ({
        testo: k.testo,
        campagna: k.campagna,
        spesa: k.spesa,
        incasso: k.incasso,
        conversioni: k.conversioni,
      })),
      destinazioniGiaInUso: destinazioni.map((d) => d.finalUrl),
    },
    schema: SCHEMA_BRIEF,
    // ⚠️ Il tetto sta basso di proposito. Un brief completo (15 titoli, 4
    // descrizioni, una ventina di keyword) sta largamente dentro i 4.000
    // token; il valore di default, 16.000, lascerebbe al modello lo spazio per
    // divagare e allungare la risposta — e questa chiamata deve stare dentro i
    // 60 secondi di `maxDuration` della pagina, che su Vercel è il tetto usato
    // ovunque nell'app. Misurato prima delle correzioni: 59 s, sul filo.
    massimoToken: 4000,
  });

  if (!esito.ok) return { ok: false, errore: esito.errore };

  let grezzo: Record<string, unknown>;
  try {
    grezzo = JSON.parse(esito.testo) as Record<string, unknown>;
  } catch {
    return { ok: false, errore: "L'AI ha risposto in una forma non leggibile: riprova." };
  }

  // ——— I limiti si impongono QUI, e quello che si scarta si DICE ———
  // Un titolo di 31 caratteri sparito in silenzio diventa «l'AI me ne ha dati
  // 7 invece di 10» senza che si capisca perché.
  const scartati: string[] = [];
  const testi = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];

  const titoliTutti = testi(grezzo.titoli);
  const titoli = titoliTutti.filter((t) => t.length <= 30).slice(0, 15);
  const titoliLunghi = titoliTutti.filter((t) => t.length > 30);
  if (titoliLunghi.length > 0) {
    scartati.push(`${titoliLunghi.length} titol${titoliLunghi.length === 1 ? "o" : "i"} oltre i 30 caratteri (es. «${titoliLunghi[0].slice(0, 45)}…»)`);
  }

  const descrizioniTutte = testi(grezzo.descrizioni);
  const descrizioni = descrizioniTutte.filter((d) => d.length <= 90).slice(0, 4);
  const descrizioniLunghe = descrizioniTutte.filter((d) => d.length > 90);
  if (descrizioniLunghe.length > 0) {
    scartati.push(`${descrizioniLunghe.length} descrizion${descrizioniLunghe.length === 1 ? "e" : "i"} oltre i 90 caratteri`);
  }

  const obiettivoGrezzo = String(grezzo.obiettivoTipo ?? "").toLowerCase();
  const obiettivoTipo = OBIETTIVI_AMMESSI.includes(obiettivoGrezzo) ? obiettivoGrezzo : "vendite";
  if (obiettivoGrezzo && obiettivoTipo !== obiettivoGrezzo) {
    scartati.push(`obiettivo «${obiettivoGrezzo}» non riconosciuto: messo «vendite», controllalo`);
  }

  const budget = Number(grezzo.budget);
  const keywords = (Array.isArray(grezzo.keywords) ? grezzo.keywords : [])
    .map((k) => {
      const o = k as Record<string, unknown>;
      const m = String(o.corrispondenza ?? "broad").toLowerCase();
      return {
        testo: String(o.testo ?? "").trim(),
        corrispondenza: MATCH_AMMESSI.includes(m) ? m : "broad",
      };
    })
    .filter((k) => k.testo);

  const brief: BriefCampagna = {
    nome: String(grezzo.nome ?? "").trim(),
    obiettivoTipo,
    budget: Number.isFinite(budget) && budget > 0 ? budget : 15,
    lingua: String(grezzo.lingua ?? "ita").toLowerCase() === "eng" ? "eng" : "ita",
    localita: testi(grezzo.localita),
    finalUrl: String(grezzo.finalUrl ?? "").trim(),
    gruppo: String(grezzo.gruppo ?? "").trim(),
    keywords,
    negative: testi(grezzo.negative),
    titoli,
    descrizioni,
    motivo: String(grezzo.motivo ?? "").trim(),
  };

  if (titoli.length < 3 && titoli.length > 0) {
    scartati.push("restano meno di 3 titoli: Google ne vuole almeno 3, aggiungine a mano");
  } else if (titoli.length > 0 && titoli.length < 15) {
    // 15 è il tetto di Google E la richiesta per l'Ad Strength «Eccellente»:
    // un brief che ne consegna meno va detto, non scoperto contando a mano.
    scartati.push(`titoli ${titoli.length} su 15: per il giudizio «Eccellente» servono tutti — completa a mano o rifai il brief`);
  }
  if (descrizioni.length > 0 && descrizioni.length < 4) {
    scartati.push(`descrizioni ${descrizioni.length} su 4`);
  }

  return {
    ok: true,
    brief,
    note: grezzo.note ? String(grezzo.note) : null,
    scartati,
    modello: esito.modello,
  };
}

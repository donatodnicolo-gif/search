import OpenAI from "openai";
import { CATEGORIE, STATI_ACQUISTO } from "./vocab";

// Integrazione OpenAI dell'app Acquisti. Due usi:
//  1. interpretaRicerca(): trasforma una domanda in italiano ("le fatture dei
//     fiori di giugno non ancora pagate") in un filtro strutturato che poi
//     applichiamo al database.
//  2. estraiDaFattura(): legge il testo di una fattura incollata e ne estrae i
//     campi (fornitore, imponibile, IVA, totale, numero, data…) per precompilare
//     il modulo di un nuovo acquisto.
// La chiave sta SOLO sul server (OPENAI_API_KEY). Senza chiave le funzioni AI
// lanciano un errore leggibile e l'app resta usabile a mano.

const MODELLO = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

let clientCache: OpenAI | null = null;
function client(): OpenAI {
  // Ripuliamo la chiave da spazi/a-capo: un "\n" finale (tipico su Vercel)
  // rende invalida l'intestazione Authorization e la fetch fallisce prima di
  // partire. Una chiave valida non contiene mai spazi, toglierli è sicuro.
  const chiave = (process.env.OPENAI_API_KEY || "").replace(/\s+/g, "");
  if (!chiave) {
    throw new Error(
      "OPENAI_API_KEY mancante: le funzioni AI (ricerca ed estrazione) sono spente. Vedi .env.example.",
    );
  }
  clientCache ??= new OpenAI({ apiKey: chiave, timeout: 45_000, maxRetries: 2 });
  return clientCache;
}

export function aiDisponibile(): boolean {
  return !!(process.env.OPENAI_API_KEY || "").replace(/\s+/g, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) Ricerca in linguaggio naturale → filtro strutturato
export type FiltroRicerca = {
  ambito: "acquisti" | "richieste";
  testo: string | null; // parole chiave libere (fornitore, descrizione…)
  categoria: string | null;
  stato: string | null;
  fornitore: string | null;
  dataDa: string | null; // ISO yyyy-mm-dd
  dataA: string | null;
  importoMin: number | null;
  importoMax: number | null;
  soloDaPagare: boolean; // "non ancora pagate", "aperte"
  spiegazione: string; // come ha interpretato la richiesta (in italiano)
};

const SCHEMA_RICERCA = {
  type: "object",
  additionalProperties: false,
  required: [
    "ambito",
    "testo",
    "categoria",
    "stato",
    "fornitore",
    "dataDa",
    "dataA",
    "importoMin",
    "importoMax",
    "soloDaPagare",
    "spiegazione",
  ],
  properties: {
    ambito: { type: "string", enum: ["acquisti", "richieste"] },
    testo: { type: ["string", "null"] },
    categoria: { type: ["string", "null"], enum: [...CATEGORIE, null] },
    stato: { type: ["string", "null"] },
    fornitore: { type: ["string", "null"] },
    dataDa: { type: ["string", "null"] },
    dataA: { type: ["string", "null"] },
    importoMin: { type: ["number", "null"] },
    importoMax: { type: ["number", "null"] },
    soloDaPagare: { type: "boolean" },
    spiegazione: { type: "string" },
  },
} as const;

export async function interpretaRicerca(query: string, oggi: string): Promise<FiltroRicerca> {
  const risposta = await client().chat.completions.create({
    model: MODELLO,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: { name: "filtro_ricerca", strict: true, schema: SCHEMA_RICERCA },
    },
    messages: [
      {
        role: "system",
        content:
          `Sei il motore di ricerca dell'app Acquisti di Deluxy. Trasformi una domanda in italiano ` +
          `in un filtro. Oggi è ${oggi}. Interpreta i riferimenti temporali ("giugno", "questo mese", ` +
          `"ultimi 3 mesi") in date ISO yyyy-mm-dd. Se la domanda parla di richieste di acquisto usa ` +
          `ambito "richieste", altrimenti "acquisti". Stati acquisto possibili: ` +
          `${STATI_ACQUISTO.map((s) => s.codice).join(", ")}. "non ancora pagate"/"aperte"/"da pagare" ` +
          `→ soloDaPagare=true. Metti a null i campi non citati. In "testo" solo le parole chiave che ` +
          `non entrano negli altri campi. "spiegazione": una frase breve su come hai inteso la richiesta.`,
      },
      { role: "user", content: query },
    ],
  });
  const raw = risposta.choices[0]?.message?.content ?? "{}";
  return JSON.parse(raw) as FiltroRicerca;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) Estrazione dei dati da una fattura incollata
export type FatturaEstratta = {
  fornitoreNome: string | null;
  fornitorePiva: string | null;
  numeroFattura: string | null;
  dataFattura: string | null; // ISO yyyy-mm-dd
  imponibile: number | null;
  iva: number | null;
  totale: number | null;
  valuta: string | null;
  categoria: string | null;
  descrizione: string | null;
  note: string | null;
};

const SCHEMA_FATTURA = {
  type: "object",
  additionalProperties: false,
  required: [
    "fornitoreNome",
    "fornitorePiva",
    "numeroFattura",
    "dataFattura",
    "imponibile",
    "iva",
    "totale",
    "valuta",
    "categoria",
    "descrizione",
    "note",
  ],
  properties: {
    fornitoreNome: { type: ["string", "null"] },
    fornitorePiva: { type: ["string", "null"] },
    numeroFattura: { type: ["string", "null"] },
    dataFattura: { type: ["string", "null"] },
    imponibile: { type: ["number", "null"] },
    iva: { type: ["number", "null"] },
    totale: { type: ["number", "null"] },
    valuta: { type: ["string", "null"] },
    categoria: { type: ["string", "null"], enum: [...CATEGORIE, null] },
    descrizione: { type: ["string", "null"] },
    note: { type: ["string", "null"] },
  },
} as const;

export async function estraiDaFattura(testo: string): Promise<FatturaEstratta> {
  const risposta = await client().chat.completions.create({
    model: MODELLO,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: { name: "fattura", strict: true, schema: SCHEMA_FATTURA },
    },
    messages: [
      {
        role: "system",
        content:
          `Estrai i dati contabili dal testo di una fattura/ordine fornitore. Gli importi sono numeri ` +
          `(punto decimale, niente simboli né separatori delle migliaia). La data in ISO yyyy-mm-dd. ` +
          `Se manca l'imponibile ma ci sono totale e IVA, calcola imponibile = totale - IVA. ` +
          `"valuta" come codice ISO (EUR, USD…). Scegli "categoria" fra quelle disponibili se evidente, ` +
          `altrimenti null. "descrizione": una riga sintetica di cosa è stato comprato. Campi assenti: null.`,
      },
      { role: "user", content: testo.slice(0, 12000) },
    ],
  });
  const raw = risposta.choices[0]?.message?.content ?? "{}";
  return JSON.parse(raw) as FatturaEstratta;
}

export function messaggioErroreAI(e: unknown): string {
  const t = e instanceof Error ? e.message : String(e);
  if (t.includes("OPENAI_API_KEY mancante")) return "Manca la chiave OpenAI: le funzioni AI sono spente.";
  if (t.includes("401") || t.toLowerCase().includes("api key")) return "Chiave OpenAI non valida.";
  if (t.toLowerCase().includes("timeout")) return "L'AI ha impiegato troppo: riprova.";
  return "Errore nell'elaborazione AI. Riprova fra poco.";
}

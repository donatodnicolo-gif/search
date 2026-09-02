import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { chiave as chiaveVault } from "@/lib/chiavi";
import { prisma } from "@/lib/db";
import { SEGRETI, segreto } from "@/lib/segreti";

// Quale AI legge i numeri: Claude o OpenAI, a scelta.
//
// Prima era cablato su OpenAI. Cambiare fornitore vuol dire cambiare SDK,
// forma della chiamata e modo di chiedere il JSON: quel lavoro sta tutto qui,
// e il resto dell'app chiede soltanto «leggi questi dati e rispondi in JSON».
//
// La chiave si può mettere in tre posti, in quest'ordine:
//   1. le impostazioni dell'app (tabella Impostazione) — la strada normale;
//   2. una variabile d'ambiente (ANTHROPIC_API_KEY / OPENAI_API_KEY);
//   3. la cassaforte del Hub.
// La 1 vince sulle altre perché è quella che si cambia senza un deploy. Le
// chiavi salvate non si rileggono mai da nessuna pagina: si sa solo SE ci sono.

export type Fornitore = "anthropic" | "openai";

export const FORNITORI: {
  chiave: Fornitore;
  nome: string;
  modelloDifetto: string;
  variabile: string;
  dove: string;
  nota: string;
}[] = [
  {
    chiave: "anthropic",
    nome: "Claude",
    modelloDifetto: "claude-opus-5",
    variabile: "ANTHROPIC_API_KEY",
    dove: "https://console.anthropic.com/settings/keys",
    nota: "Riceve lo schema della risposta e non può uscirne: niente JSON storti da ripulire.",
  },
  {
    chiave: "openai",
    nome: "OpenAI",
    modelloDifetto: "gpt-4o",
    variabile: "OPENAI_API_KEY",
    dove: "https://platform.openai.com/api-keys",
    nota: "Con i modelli «mini» le istruzioni lunghe vengono ignorate: misurato in casa, 0 volte su 6 contro 6 su 6 del modello grande.",
  },
];

export const impChiaveApi = (f: Fornitore) => `ai_chiave_${f}`;
export const impModello = (f: Fornitore) => `ai_modello_${f}`;
export const IMP_FORNITORE = "ai_fornitore";
// Il blocco di istruzioni operative dell'AI: il RUOLO, il protocollo PONTE, i
// vincoli di esecuzione. Sta nel database e non nel codice perché è un
// documento di lavoro, non una scelta tecnica: lo cambia il custode quando
// cambia il protocollo, senza toccare l'app.
export const IMP_ISTRUZIONI = "ai_istruzioni";

const leggiImp = async (chiave: string): Promise<string | null> => {
  // ⚠️ Le CREDENZIALI passano da `segreto()`, che mette l'ambiente davanti al
  // database: `ai_chiave_anthropic` stava in chiaro su un Postgres condiviso
  // da quattordici app. Le altre impostazioni (fornitore, modello, istruzioni)
  // non sono segreti e restano dove sono — è la pagina Impostazioni a
  // cambiarle, ed è giusto così.
  if (chiave in SEGRETI) return segreto(chiave);
  const r = await prisma.impostazione.findUnique({ where: { chiave } }).catch(() => null);
  const v = (r?.valore ?? "").trim();
  return v || null;
};

// Le istruzioni operative depositate dal custode. Valgono per OGNI chiamata
// all'AI: vengono prima delle istruzioni della singola pagina, che descrivono
// solo il compito del momento.
export async function istruzioniOperative(): Promise<string | null> {
  return leggiImp(IMP_ISTRUZIONI);
}

export async function fornitoreScelto(): Promise<Fornitore> {
  const v = await leggiImp(IMP_FORNITORE);
  return v === "openai" || v === "anthropic" ? v : "anthropic";
}

// La chiave e da dove arriva: serve a dirlo in chiaro nelle impostazioni,
// perché «non funziona» ha risposte diverse se la chiave sta nell'app o in una
// variabile d'ambiente che solo un deploy può cambiare.
export async function chiaveDi(
  f: Fornitore
): Promise<{ valore: string | null; origine: "impostazioni" | "ambiente" | null }> {
  const salvata = await leggiImp(impChiaveApi(f));
  if (salvata) return { valore: salvata, origine: "impostazioni" };
  const variabile = FORNITORI.find((x) => x.chiave === f)!.variabile;
  const esterna = (await chiaveVault(variabile))?.replace(/\s+/g, "") || null;
  return esterna ? { valore: esterna, origine: "ambiente" } : { valore: null, origine: null };
}

export async function modelloDi(f: Fornitore): Promise<string> {
  const salvato = await leggiImp(impModello(f));
  if (salvato) return salvato;
  const env = ((f === "openai" ? process.env.OPENAI_MODEL : process.env.ANTHROPIC_MODEL) || "").trim();
  return env || FORNITORI.find((x) => x.chiave === f)!.modelloDifetto;
}

export type StatoAi = {
  fornitore: Fornitore;
  nome: string;
  modello: string;
  configurata: boolean;
  origine: "impostazioni" | "ambiente" | null;
  // Le altre chiavi presenti: si può cambiare fornitore senza reinserirle
  chiaviPresenti: Record<Fornitore, "impostazioni" | "ambiente" | null>;
};

export async function statoAi(): Promise<StatoAi> {
  const fornitore = await fornitoreScelto();
  const [propria, altre, modello] = await Promise.all([
    chiaveDi(fornitore),
    Promise.all(FORNITORI.map(async (f) => [f.chiave, (await chiaveDi(f.chiave)).origine] as const)),
    modelloDi(fornitore),
  ]);
  return {
    fornitore,
    nome: FORNITORI.find((x) => x.chiave === fornitore)!.nome,
    modello,
    configurata: Boolean(propria.valore),
    origine: propria.origine,
    chiaviPresenti: Object.fromEntries(altre) as StatoAi["chiaviPresenti"],
  };
}

export type EsitoAi =
  | { ok: true; testo: string; fornitore: Fornitore; modello: string }
  | { ok: false; errore: string; configurata: boolean };

/**
 * Una domanda all'AI scelta, con risposta in JSON.
 *
 * `schema` è lo schema JSON della risposta attesa. Claude lo riceve e non può
 * uscirne (structured outputs); OpenAI si accontenta di sapere che deve
 * rispondere in JSON. In entrambi i casi chi chiama valida comunque quello che
 * torna: uno schema rispettato non vuol dire un contenuto sensato.
 */
export async function chiediAllAi(opzioni: {
  istruzioni: string;
  dati: unknown;
  schema?: Record<string, unknown>;
  massimoToken?: number;
  /**
   * Fornitore IMPOSTO da chi chiama, sopra la scelta globale delle
   * Impostazioni. Serve quando un compito specifico deve usare un motore
   * preciso (26/08: il brief di creazione campagna va su OpenAI per scelta
   * dell'utente) senza spostare tutto il resto — schede e riconciliazioni
   * restano sul fornitore globale, che ha gli structured outputs.
   */
  fornitore?: Fornitore;
}): Promise<EsitoAi> {
  const fornitore = opzioni.fornitore ?? (await fornitoreScelto());
  const nome = FORNITORI.find((x) => x.chiave === fornitore)!.nome;
  const { valore: apiKey } = await chiaveDi(fornitore);
  if (!apiKey) {
    return {
      ok: false,
      configurata: false,
      errore: `Manca la chiave di ${nome}: si mette in Impostazioni → Intelligenza artificiale, oppure nella variabile ${FORNITORI.find((x) => x.chiave === fornitore)!.variabile}.`,
    };
  }
  const modello = await modelloDi(fornitore);
  const massimoToken = opzioni.massimoToken ?? 16000;

  // Il protocollo del custode sta SOPRA il compito del momento: se le due cose
  // si contraddicono deve vincere il protocollo, ed è l'ordine a dirlo.
  const protocollo = await istruzioniOperative();
  const istruzioni = protocollo
    ? `${protocollo}

═══ COMPITO DI QUESTA CHIAMATA ═══
${opzioni.istruzioni}`
    : opzioni.istruzioni;

  try {
    const testo =
      fornitore === "anthropic"
        ? await chiediAClaude({ apiKey, modello, massimoToken, ...opzioni, istruzioni })
        : await chiediAOpenAi({ apiKey, modello, massimoToken, ...opzioni, istruzioni });
    if (!testo.trim()) {
      return { ok: false, configurata: true, errore: `${nome} ha risposto senza contenuto.` };
    }
    return { ok: true, testo, fornitore, modello };
  } catch (e) {
    return {
      ok: false,
      configurata: true,
      errore: `Chiamata a ${nome} (${modello}) fallita: ${String(e).slice(0, 240)}`,
    };
  }
}

async function chiediAClaude(o: {
  apiKey: string;
  modello: string;
  massimoToken: number;
  istruzioni: string;
  dati: unknown;
  schema?: Record<string, unknown>;
}): Promise<string> {
  const client = new Anthropic({ apiKey: o.apiKey, timeout: 120_000, maxRetries: 2 });
  const risposta = await client.messages.create({
    model: o.modello,
    max_tokens: o.massimoToken,
    system: o.istruzioni,
    // Lo schema, quando c'è, è vincolante: la risposta non può che avere
    // quella forma, quindi non serve difendersi dal JSON malfatto.
    ...(o.schema ? { output_config: { format: { type: "json_schema" as const, schema: o.schema } } } : {}),
    messages: [{ role: "user", content: JSON.stringify(o.dati) }],
  });
  // Un rifiuto NON è un errore HTTP: arriva un 200 con content vuoto. Va
  // riconosciuto prima di leggere il testo, altrimenti sembra una risposta
  // vuota senza spiegazione.
  if (risposta.stop_reason === "refusal") {
    throw new Error("il modello ha rifiutato di rispondere a questa richiesta");
  }
  return risposta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function chiediAOpenAi(o: {
  apiKey: string;
  modello: string;
  massimoToken: number;
  istruzioni: string;
  dati: unknown;
}): Promise<string> {
  const client = new OpenAI({ apiKey: o.apiKey, timeout: 120_000, maxRetries: 2 });
  const risposta = await client.chat.completions.create({
    model: o.modello,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: o.istruzioni },
      { role: "user", content: JSON.stringify(o.dati) },
    ],
  });
  return risposta.choices[0]?.message?.content ?? "";
}

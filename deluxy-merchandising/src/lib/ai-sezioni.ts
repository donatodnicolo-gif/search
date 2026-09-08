// **L'AI riempie le sezioni della categoria.**
//
// Chiesto dall'utente l'08/09/2026: «l'AI deve essere in grado di riempire le
// varie sezioni di ogni categoria». Finora sapeva scrivere solo la descrizione,
// e le sezioni — che sono le tab della scheda sul sito — restavano a mano.
//
// ⚠️ **Il modello non sa cosa c'è dentro un prodotto.** Non conosce gli
// ingredienti di una torta né quanti steli ha un bouquet, e la sezione più
// importante di tutte è **Allergeni**: un elenco inventato non è un testo
// sbagliato, è un rischio per chi lo legge. Quindi:
//   · si passano SOLO dati veri (nome, categoria, materiali, note, varianti,
//     prezzo) e si vieta di aggiungerne;
//   · le sezioni che parlano di **ingredienti, allergeni, pesi e misure** si
//     compilano solo se quei dati sono stati dati, altrimenti restano vuote —
//     meglio una casella vuota che una lista di allergeni inventata;
//   · **non si sovrascrive** ciò che una persona ha già scritto.
//
// Come per la descrizione: qui non si pubblica niente. Il testo arriva nei
// campi del modulo, e qualcuno lo rilegge prima di salvare.

import { etichettaCategoria } from "./dominio";
import { leggiSegreto } from "./segreti";
import { promptDiCategoria } from "./ai-descrizione";

const MODELLO = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

/** Le sezioni che NON si inventano: senza dati veri restano vuote. */
const DA_NON_INVENTARE = /ingredient|allergen|peso|pesi|misur|dimension|conservazion|calor|nutrizion/i;

export type SezioneDaRiempire = { nome: string; tipo: string };

export type DatiPerSezioni = {
  nome: string;
  categoria: string;
  sito: string;
  materiali: string;
  note: string;
  prezzo: string;
  varianti: string[];
  descrizione: string;
  sezioni: SezioneDaRiempire[];
  /** Quelle già scritte da una persona: non si toccano, servono da contesto. */
  gia: Record<string, string>;
};

export type EsitoSezioni =
  | { ok: true; sezioni: Record<string, string>; saltate: string[]; modello: string }
  | { ok: false; errore: string; configurata: boolean };

const COME_SI_SCRIVE: Record<string, string> = {
  testo: "un paragrafo breve, 1-3 frasi",
  elenco: "un elenco: una voce per riga, senza puntini né trattini iniziali",
  coppie: "una coppia per riga, nella forma «Nome: valore»",
};

export async function riempiSezioni(d: DatiPerSezioni): Promise<EsitoSezioni> {
  const chiave = await leggiSegreto("OPENAI_API_KEY");
  if (!chiave) return { ok: false, configurata: false, errore: "Manca la chiave OpenAI (Negozi & permessi)." };

  const daFare = d.sezioni.filter((s) => !(d.gia[s.nome] ?? "").trim());
  if (!daFare.length) return { ok: true, sezioni: {}, saltate: [], modello: MODELLO };

  const senzaDati = !d.materiali.trim() && !d.note.trim();
  const promptCategoria = await promptDiCategoria(d.categoria);

  const istruzioni = `Compili le sezioni della scheda prodotto di Deluxy, maison italiana di fiori, torte e regali di lusso. La scheda va sul sito ${d.sito}.

Regole non negoziabili:
- Usa SOLO le informazioni che ti vengono date. Non inventare ingredienti, allergeni, misure, pesi, tempi di conservazione, numero di fiori, provenienze.
- Se per una sezione non hai dati sufficienti, **lasciala fuori dalla risposta**: una sezione vuota è corretta, una sezione inventata è un danno. Vale soprattutto per ingredienti e allergeni, che una persona legge per decidere se può mangiare una cosa.
- Niente superlativi a raffica, niente emoji, niente promesse di consegna o di prezzo.
- Italiano corretto e asciutto. Nessun titolo dentro il testo: il titolo è il nome della sezione.
${promptCategoria ? `\nIndicazioni di questa categoria, scritte da chi la cura — hanno la precedenza:\n${promptCategoria}` : ""}

Le sezioni da compilare, con la forma che devono avere:
${daFare.map((s) => `- "${s.nome}": ${COME_SI_SCRIVE[s.tipo] ?? COME_SI_SCRIVE.testo}`).join("\n")}

Rispondi SOLO in JSON, con una chiave per ogni sezione che sai compilare davvero:
{ ${daFare.map((s) => `"${s.nome}": "…"`).join(", ")} }`;

  const dati = {
    nome: d.nome,
    categoria: etichettaCategoria(d.categoria),
    sito: d.sito,
    materialiOComposizione: d.materiali || null,
    noteDiSpecifica: d.note || null,
    prezzo: d.prezzo || null,
    varianti: d.varianti.filter(Boolean),
    descrizioneGiaScritta: d.descrizione || null,
    sezioniGiaCompilate: d.gia,
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` },
      body: JSON.stringify({
        model: MODELLO,
        temperature: 0.5,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: istruzioni },
          { role: "user", content: JSON.stringify(dati) },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });
    if (!res.ok) {
      const testo = await res.text().catch(() => "");
      throw new Error(res.status === 401 ? "Chiave OpenAI rifiutata (401)." : `OpenAI ha risposto ${res.status}. ${testo.slice(0, 160)}`);
    }
    const corpo = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const contenuto = corpo.choices?.[0]?.message?.content;
    if (!contenuto) throw new Error("Risposta del modello vuota.");
    const g = JSON.parse(contenuto) as Record<string, unknown>;

    const sezioni: Record<string, string> = {};
    const saltate: string[] = [];
    for (const s of daFare) {
      const v = g[s.nome];
      const testo = typeof v === "string" ? v.trim() : "";
      if (!testo) { saltate.push(s.nome); continue; }
      // ⚠️ Il guardrail vero: senza materiali né note, una sezione di
      // ingredienti/allergeni/misure sarebbe **inventata**. La si scarta anche
      // se il modello l'ha scritta lo stesso.
      if (senzaDati && DA_NON_INVENTARE.test(s.nome)) { saltate.push(s.nome); continue; }
      sezioni[s.nome] = testo.slice(0, 4000);
    }
    return { ok: true, sezioni, saltate, modello: MODELLO };
  } catch (e) {
    return { ok: false, configurata: true, errore: e instanceof Error ? e.message : "Errore sconosciuto." };
  }
}

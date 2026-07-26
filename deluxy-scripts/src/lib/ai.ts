import OpenAI from "openai";
import { CANALI, CATEGORIE, VARIABILI_COMUNI } from "./variabili";

// L'AI che scrive e sistema i testi.
//
// Tre regole, e non sono negoziabili:
//
// 1. **L'AI propone, non pubblica.** Restituisce una bozza che compare a
//    schermo: finché una persona non preme «usa questa versione» non si salva
//    niente, e mandare il messaggio resta un gesto umano.
// 2. **Non inventa dati.** Nomi, date, orari, indirizzi, prezzi e sconti non
//    li conosce: dove servono mette una variabile `{{COSÌ}}`. Un modello che
//    riempie i buchi da solo produce un invito con la data sbagliata, e quella
//    parte davvero al cliente.
// 3. **Scrive in italiano**, con il tono di Deluxy: sobrio, cortese, concreto.
//    Niente superlativi da volantino, niente emoji se non richieste.
//
// Chiave in OPENAI_API_KEY, modello in OPENAI_MODEL (default gpt-4o-mini),
// come nelle altre app Deluxy. Senza chiave le funzioni AI restano spente e
// l'app funziona esattamente come prima.

const MODELLO = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

export function aiConfigurata(): boolean {
  return Boolean((process.env.OPENAI_API_KEY || "").replace(/\s+/g, ""));
}

let clientCache: OpenAI | null = null;
function client(): OpenAI {
  // Chiave ripulita da spazi e a-capo: se nel valore salvato su Vercel resta un
  // "\n", l'header Authorization diventa invalido e la chiamata fallisce prima
  // di partire, con un errore che sembra di rete (trappola già pagata in
  // deluxy-mail).
  const chiave = (process.env.OPENAI_API_KEY || "").replace(/\s+/g, "");
  if (!chiave) {
    throw new Error("OPENAI_API_KEY mancante: l'AI è spenta. Vedi .env.example.");
  }
  clientCache ??= new OpenAI({ apiKey: chiave, timeout: 45_000, maxRetries: 2 });
  return clientCache;
}

export type Proposta = {
  titolo: string; // vuoto quando si sta sistemando un testo che il titolo ce l'ha già
  oggetto: string; // vuoto se il canale non è email
  corpo: string;
  variabili: { chiave: string; aCosaServe: string }[];
  note: string; // cosa ha cambiato o su cosa ha dovuto tirare a indovinare
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titolo", "oggetto", "corpo", "variabili", "note"],
  properties: {
    titolo: { type: "string", description: "Titolo interno del testo, max 8 parole. Vuoto se già fornito." },
    oggetto: { type: "string", description: "Oggetto dell'email. Stringa vuota se il canale non è email." },
    corpo: { type: "string", description: "Il messaggio, in italiano, con i segnaposto {{VARIABILE}}." },
    variabili: {
      type: "array",
      description: "Ogni segnaposto usato nel testo, con una riga che spiega cosa ci va.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chiave", "aCosaServe"],
        properties: {
          chiave: { type: "string", description: "MAIUSCOLO_CON_UNDERSCORE, come appare fra le graffe." },
          aCosaServe: { type: "string", description: "Una riga: che dato ci va." },
        },
      },
    },
    note: {
      type: "string",
      description:
        "Una o due righe per chi rilegge: cosa hai cambiato, cosa non sapevi e hai lasciato come variabile.",
    },
  },
} as const;

const REGOLE = `Scrivi per Deluxy, che consegna fiori e regali di lusso a domicilio in guanti bianchi.

Come devi scrivere:
- in italiano, con il "lei" salvo diversa indicazione; tono sobrio, cortese, concreto;
- frasi brevi, niente superlativi da volantino ("straordinario", "imperdibile"), niente emoji se non richieste;
- niente promesse che l'azienda non ha autorizzato: sconti, tempi di consegna, disponibilità, prezzi.

Regola dei dati (la più importante):
- non inventare MAI nomi, date, orari, indirizzi, numeri, prezzi, link;
- dove serve un dato che non ti è stato dato, metti una variabile {{COSÌ}}, in MAIUSCOLO con underscore;
- riusa questi nomi quando calzano, invece di inventarne di simili: ${VARIABILI_COMUNI.join(", ")};
- se un dato ti è stato dato nel brief, scrivilo per esteso: è già una decisione presa da una persona.

Per WhatsApp e SMS: più corto, niente formule da lettera, a capo per respirare.
Per l'email: oggetto breve e chiaro, senza punti esclamativi.
Per il telefono: scrivi un copione parlato, con le pause e le domande da fare.`;

function descrizioneCanale(canale: string): string {
  return CANALI.find((c) => c.valore === canale)?.nome ?? canale;
}

function descrizioneCategoria(categoria: string): string {
  return CATEGORIE.find((c) => c.valore === categoria)?.nome ?? categoria;
}

async function chiedi(istruzioni: string, richiesta: string): Promise<Proposta> {
  const risposta = await client().chat.completions.create({
    model: MODELLO,
    temperature: 0.7,
    messages: [
      { role: "system", content: `${REGOLE}\n\n${istruzioni}` },
      { role: "user", content: richiesta },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "proposta_testo", strict: true, schema: SCHEMA },
    },
  });
  const contenuto = risposta.choices[0]?.message?.content;
  if (!contenuto) throw new Error("Il modello non ha risposto nulla.");
  const p = JSON.parse(contenuto) as Proposta;
  return {
    titolo: (p.titolo ?? "").trim(),
    oggetto: (p.oggetto ?? "").trim(),
    corpo: (p.corpo ?? "").trim(),
    variabili: Array.isArray(p.variabili) ? p.variabili : [],
    note: (p.note ?? "").trim(),
  };
}

// Prima stesura a partire da un brief scritto da una persona.
export async function scriviBozza(dati: {
  brief: string;
  categoria: string;
  canale: string;
  tono?: string;
}): Promise<Proposta> {
  return chiedi(
    `Scrivi la PRIMA STESURA di un testo aziendale riutilizzabile: non è un messaggio per una persona sola,
è un modello che verrà usato molte volte cambiando i dati dentro le variabili.
Proponi anche un titolo interno breve, che serve a ritrovarlo nell'archivio.`,
    [
      `Categoria: ${descrizioneCategoria(dati.categoria)}`,
      `Canale: ${descrizioneCanale(dati.canale)}`,
      dati.tono ? `Tono richiesto: ${dati.tono}` : null,
      "",
      "Brief di chi lo ha chiesto:",
      dati.brief,
    ]
      .filter((r) => r !== null)
      .join("\n"),
  );
}

// Riscrittura di un testo che esiste già. `istruzione` è quello che chiede la
// persona ("più corto", "adattalo a WhatsApp", "meno formale").
export async function sistemaTesto(dati: {
  titolo: string;
  oggetto: string | null;
  corpo: string;
  categoria: string;
  canale: string;
  istruzione: string;
}): Promise<Proposta> {
  return chiedi(
    `Ti do un testo aziendale già scritto e una richiesta di modifica.
Riscrivilo tenendo il significato e le variabili {{COSÌ}} che ci sono già: non toglierle e non rinominarle
senza motivo, e non riempirle con valori inventati. Se la richiesta implica un dato che non hai, aggiungi una
variabile nuova invece di inventarlo. Nel campo "note" scrivi in due righe cosa hai cambiato.
Il titolo lascialo vuoto: quello lo decide chi l'ha scritto.
Se il canale è email, riporta sempre un oggetto: quello di prima se va ancora bene, altrimenti il tuo.`,
    [
      `Categoria: ${descrizioneCategoria(dati.categoria)}`,
      `Canale: ${descrizioneCanale(dati.canale)}`,
      `Titolo attuale: ${dati.titolo}`,
      dati.oggetto ? `Oggetto attuale: ${dati.oggetto}` : "Oggetto attuale: (nessuno)",
      "",
      "Testo attuale:",
      dati.corpo,
      "",
      `Richiesta: ${dati.istruzione}`,
    ].join("\n"),
  );
}

// Le richieste pronte, quelle che si usano ogni giorno.
export const RITOCCHI = [
  { valore: "corto", nome: "Più corto", istruzione: "Accorcialo di circa un terzo, senza perdere nessuna informazione." },
  { valore: "formale", nome: "Più formale", istruzione: "Rendilo più formale e istituzionale, adatto a un cliente B2B importante." },
  { valore: "caldo", nome: "Più caloroso", istruzione: "Rendilo più caloroso e personale, restando professionale." },
  { valore: "whatsapp", nome: "Adatta a WhatsApp", istruzione: "Adattalo a un messaggio WhatsApp: breve, diretto, senza formule da lettera." },
  { valore: "email", nome: "Adatta a email", istruzione: "Adattalo a un'email, con un oggetto breve e una struttura da lettera." },
  { valore: "variabili", nome: "Proponi le variabili", istruzione: "Sostituisci con variabili {{COSÌ}} tutti i dati che cambiano da un invio all'altro." },
  { valore: "chiaro", nome: "Più chiaro", istruzione: "Togli ripetizioni e giri di parole: la stessa cosa detta più semplice." },
] as const;

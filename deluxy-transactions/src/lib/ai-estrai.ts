import { ibanValido, normalizzaIban, paeseIban } from "./iban";

// Lettura AI di una richiesta di pagamento: da un testo incollato (chat,
// email) o da un'immagine (schermata WhatsApp, foto di una fattura) escono
// importo, IBAN, intestatario, causale.
//
// È il motore CENTRALE dell'ecosistema (giuria 28/08/2026): le app che non
// hanno un motore proprio (Finance, Scout, Piattaforma) chiamano
// POST /api/v1/estrai invece di tenere quattro copie dello stesso prompt.
// Il Customer Service tiene il suo per ora (deviazione dichiarata, stessa
// regola e stesso prompt: convergenza annotata in docs/HANDOFF.md).
//
// Le regole non negoziabili, uguali al CS:
//  • l'AI PROPONE, il checksum mod-97 DECIDE: ibanValido lo dice il codice;
//  • l'esito NON alimenta mai una scrittura senza conferma umana — riempie un
//    modulo che una persona rilegge e salva;
//  • prompt fisso, output vincolato a uno schema JSON: il contenuto letto
//    (che arriva da un fornitore, cioè dal mondo) non può cambiare le regole.
//
// Modelli: gpt-4o-mini per il testo, gpt-4o per le immagini (misurato nel CS:
// il mini su un'immagine ha perso due zeri di un IBAN), claude come riserva.
// Chiavi SOLO dall'ambiente: quest'app non ha una pagina per incollarle.

const MODELLO_TESTO = "gpt-4o-mini";
const MODELLO_IMMAGINI = "gpt-4o";
const MODELLO_CLAUDE = "claude-opus-5";

export type Immagine = { dati: string; tipo: string }; // base64 senza prefisso

export type DatiEstratti = {
  iban: string;
  intestatario: string;
  importo: number;
  valuta: string;
  causale: string;
};

export type EsitoEstrazione =
  | { stato: "ok"; dati: DatiEstratti; ibanValido: boolean; ibanPaese: string; fornitore: string }
  | { stato: "non-configurato" }
  | { stato: "errore"; messaggio: string };

const SCHEMA = {
  type: "object",
  properties: {
    iban: { type: "string", description: "L'IBAN senza spazi, in maiuscolo. Stringa vuota se non compare." },
    intestatario: {
      type: "string",
      description: "Nome e cognome (o ragione sociale) dell'intestatario del conto. Stringa vuota se non compare.",
    },
    importo: { type: "number", description: "L'importo da pagare in cifre, 0 se non compare. Usa il punto per i decimali." },
    valuta: { type: "string", description: "Codice valuta a 3 lettere, es. EUR. 'EUR' se non è indicata." },
    causale: { type: "string", description: "La causale del pagamento se indicata, altrimenti stringa vuota." },
  },
  required: ["iban", "intestatario", "importo", "valuta", "causale"],
  additionalProperties: false,
} as const;

const ISTRUZIONI = `Estrai le coordinate di pagamento dal contenuto fornito.

Regole:
- Riporta l'IBAN esattamente come appare, senza spazi e in maiuscolo. Non correggerlo, non completarlo e non inventarne parti: se una parte è illeggibile, lascia il campo vuoto.
- L'intestatario è chi riceve il pagamento (il titolare del conto), non chi paga.
- L'importo va in cifre: "1.250,50 €" diventa 1250.50.
- Se un dato non compare, lascia il campo vuoto (0 per l'importo). Non dedurre e non tirare a indovinare.`;

// Le chiavi incollate possono portarsi dietro un a-capo (lezione deluxy-mail).
const pulisci = (s: string) => (s ?? "").replace(/\s+/g, "");

function normalizza(grezzi: Partial<DatiEstratti>, fornitore: string): EsitoEstrazione {
  const iban = normalizzaIban(grezzi.iban ?? "");
  return {
    stato: "ok",
    dati: {
      iban,
      intestatario: (grezzi.intestatario ?? "").trim(),
      importo: Number(grezzi.importo) || 0,
      valuta: ((grezzi.valuta || "EUR") + "").toUpperCase(),
      causale: (grezzi.causale ?? "").trim(),
    },
    ibanValido: iban ? ibanValido(iban) : false,
    ibanPaese: iban ? paeseIban(iban) : "",
    fornitore,
  };
}

async function conOpenAI(chiave: string, modello: string, testo?: string, immagine?: Immagine): Promise<EsitoEstrazione> {
  const contenuto: unknown[] = [];
  if (immagine) {
    contenuto.push({ type: "image_url", image_url: { url: `data:${immagine.tipo};base64,${immagine.dati}` } });
  }
  contenuto.push({ type: "text", text: testo ? `Contenuto:\n${testo}` : "Leggi l'immagine." });

  const risposta = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${chiave}` },
    body: JSON.stringify({
      model: modello,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: { name: "dati_pagamento", strict: true, schema: SCHEMA },
      },
      messages: [
        { role: "system", content: ISTRUZIONI },
        { role: "user", content: contenuto },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!risposta.ok) {
    const corpo = await risposta.text().catch(() => "");
    return { stato: "errore", messaggio: `OpenAI ${risposta.status}: ${corpo.slice(0, 200)}` };
  }
  const dati = (await risposta.json()) as { choices?: { message?: { content?: string } }[] };
  const testoRisposta = dati.choices?.[0]?.message?.content;
  if (!testoRisposta) return { stato: "errore", messaggio: "Risposta vuota dal modello." };
  return normalizza(JSON.parse(testoRisposta) as DatiEstratti, `OpenAI ${modello}`);
}

async function conClaude(chiave: string, testo?: string, immagine?: Immagine): Promise<EsitoEstrazione> {
  const contenuto: unknown[] = [];
  if (immagine) {
    contenuto.push({ type: "image", source: { type: "base64", media_type: immagine.tipo, data: immagine.dati } });
  }
  contenuto.push({ type: "text", text: testo ? `${ISTRUZIONI}\n\nContenuto:\n${testo}` : ISTRUZIONI });

  const risposta = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": chiave,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELLO_CLAUDE,
      max_tokens: 2000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: contenuto }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!risposta.ok) {
    const corpo = await risposta.text().catch(() => "");
    return { stato: "errore", messaggio: `Anthropic ${risposta.status}: ${corpo.slice(0, 200)}` };
  }
  const dati = (await risposta.json()) as { stop_reason?: string; content?: { type: string; text?: string }[] };
  if (dati.stop_reason === "refusal") {
    return { stato: "errore", messaggio: "Il modello ha rifiutato di elaborare questo contenuto." };
  }
  const blocco = dati.content?.find((b) => b.type === "text");
  if (!blocco?.text) return { stato: "errore", messaggio: "Risposta vuota dal modello." };
  return normalizza(JSON.parse(blocco.text) as DatiEstratti, `Claude ${MODELLO_CLAUDE}`);
}

export function estrazioneConfigurata(): boolean {
  return Boolean(pulisci(process.env.OPENAI_API_KEY ?? "") || pulisci(process.env.ANTHROPIC_API_KEY ?? ""));
}

export async function estraiPagamento(opzioni: { testo?: string; immagine?: Immagine }): Promise<EsitoEstrazione> {
  const chiaveOpenai = pulisci(process.env.OPENAI_API_KEY ?? "");
  const chiaveClaude = pulisci(process.env.ANTHROPIC_API_KEY ?? "");
  if (!chiaveOpenai && !chiaveClaude) return { stato: "non-configurato" };

  try {
    if (chiaveOpenai) {
      // Con un'immagine si usa il modello più accurato: un IBAN letto male
      // sarebbe un bonifico sbagliato.
      return await conOpenAI(chiaveOpenai, opzioni.immagine ? MODELLO_IMMAGINI : MODELLO_TESTO, opzioni.testo, opzioni.immagine);
    }
    return await conClaude(chiaveClaude, opzioni.testo, opzioni.immagine);
  } catch (e) {
    return { stato: "errore", messaggio: e instanceof Error ? e.message : "errore" };
  }
}

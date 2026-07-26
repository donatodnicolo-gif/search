// L'AI di Orders (OpenAI / ChatGPT).
//
// COSA FA QUI DENTRO, e cosa non farà mai. L'AI **propone**, un controllo
// deterministico **decide**, una persona **conferma**. È la stessa regola che
// tiene in piedi le altre app Deluxy: la lettura di un IBAN da una foto passa
// dal checksum, uno script scelto dall'AI passa dall'elenco degli script veri.
// Qui vale per le categorie di prodotto: la risposta dell'AI si accetta solo se
// è una delle categorie che esistono davvero, altrimenti si butta.
//
// Cosa NON deve fare: decidere da sola su soldi, consegne o messaggi che partono
// verso i clienti. Quelle restano cose con un responsabile umano davanti.
//
// La chiave: `OPENAI_API_KEY` (+ `OPENAI_MODEL`, di default gpt-4o-mini, lo
// stesso modello che usano AI Mail e il Customer Service). Se manca, tutto ciò
// che è AI si spegne e lo dice — non si finge di aver risposto.

const URL_API = "https://api.openai.com/v1/chat/completions";

export function modelloAI(): string {
  return (process.env.OPENAI_MODEL ?? "").trim() || "gpt-4o-mini";
}

// La chiave, ripulita: un BOM invisibile incollato in una variabile d'ambiente
// fa fallire la richiesta con un errore che parla di ByteString e non dice
// niente a nessuno (già successo in deluxy-partner).
export function chiaveAI(): string {
  return (process.env.OPENAI_API_KEY ?? "").replace(/^﻿/, "").trim();
}

export function aiConfigurata(): boolean {
  return chiaveAI().length > 20;
}

export type EsitoAI<T> = { ok: true; dati: T } | { ok: false; errore: string };

type Opzioni = {
  // Istruzioni di sistema: chi è e cosa deve fare.
  sistema: string;
  // Quanto può sbizzarrirsi. Per classificare si tiene bassa: qui non serve
  // fantasia, serve che due giri diano la stessa risposta.
  temperatura?: number;
  // Secondi di pazienza prima di mollare.
  timeout?: number;
};

// Una domanda all'AI che DEVE tornare JSON. Non si fida della forma: chi
// chiama valida il contenuto (vedi categorie-ai.ts).
export async function chiediJson<T>(domanda: string, o: Opzioni): Promise<EsitoAI<T>> {
  const chiave = chiaveAI();
  if (!chiave) {
    return {
      ok: false,
      errore:
        "OpenAI non è configurata: manca OPENAI_API_KEY (in locale nel .env, in produzione fra le variabili del progetto Vercel).",
    };
  }

  let risposta: Response;
  try {
    risposta = await fetch(URL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` },
      body: JSON.stringify({
        model: modelloAI(),
        temperature: o.temperatura ?? 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: o.sistema },
          { role: "user", content: domanda },
        ],
      }),
      signal: AbortSignal.timeout((o.timeout ?? 60) * 1000),
    });
  } catch (e) {
    const m = (e as Error).message;
    return { ok: false, errore: /timeout|abort/i.test(m) ? "OpenAI non ha risposto in tempo." : `Rete: ${m}` };
  }

  if (!risposta.ok) {
    const testo = (await risposta.text().catch(() => "")).slice(0, 300);
    // I due errori che capitano davvero, detti in italiano invece che in gergo.
    if (risposta.status === 401) return { ok: false, errore: "OpenAI ha rifiutato la chiave (401): è scaduta o sbagliata." };
    if (risposta.status === 429)
      return { ok: false, errore: "OpenAI ha risposto «troppe richieste» (429): riprova fra un minuto, o il credito è finito." };
    return { ok: false, errore: `OpenAI ha risposto ${risposta.status}: ${testo}` };
  }

  const corpo = await risposta.json().catch(() => null);
  const testo = corpo?.choices?.[0]?.message?.content;
  if (typeof testo !== "string") return { ok: false, errore: "OpenAI ha risposto senza contenuto." };

  try {
    return { ok: true, dati: JSON.parse(testo) as T };
  } catch {
    return { ok: false, errore: `OpenAI ha risposto qualcosa che non è JSON: ${testo.slice(0, 200)}` };
  }
}

// Una domanda a cui basta un testo (letture, commenti, riassunti).
export async function chiediTesto(domanda: string, o: Opzioni): Promise<EsitoAI<string>> {
  const esito = await chiediJson<{ testo?: string }>(
    `${domanda}\n\nRispondi con un oggetto JSON: { "testo": "…" }.`,
    o,
  );
  if (!esito.ok) return esito;
  const t = typeof esito.dati?.testo === "string" ? esito.dati.testo.trim() : "";
  return t ? { ok: true, dati: t } : { ok: false, errore: "L'AI non ha scritto niente." };
}

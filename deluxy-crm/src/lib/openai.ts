import { chiaveApp } from "./chiavi-app";

// La chiamata al modello, in un posto solo: chiave e modello dal pattern
// standard (cassaforte del Hub → env), risposta SOLO JSON, timeout vero.
// Il modello si sceglie da variabile (OPENAI_MODEL), mai nel codice (§5.5).

export type EsitoAI<T> = { ok: true; dati: T; modello: string } | { ok: false; errore: string };

export async function chiediJson<T>(sistema: string, utente: string): Promise<EsitoAI<T>> {
  const [chiave, modelloEnv] = await Promise.all([chiaveApp("OPENAI_API_KEY"), chiaveApp("OPENAI_MODEL")]);
  if (!chiave) {
    return { ok: false, errore: "Manca OPENAI_API_KEY: senza chiave l'AI non può leggere il brief." };
  }
  const modello = modelloEnv || "gpt-4o-mini";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chiave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modello,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sistema },
          { role: "user", content: utente },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const corpo = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { ok: false, errore: corpo?.error?.message ?? `OpenAI risponde ${res.status}.` };
    }
    const dati = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const testo = dati.choices?.[0]?.message?.content;
    if (!testo) return { ok: false, errore: "Il modello non ha risposto." };
    return { ok: true, dati: JSON.parse(testo) as T, modello };
  } catch (e) {
    if ((e as Error).name === "TimeoutError") return { ok: false, errore: "Il modello non ha risposto in tempo." };
    return { ok: false, errore: "Risposta del modello non leggibile (JSON rotto)." };
  }
}

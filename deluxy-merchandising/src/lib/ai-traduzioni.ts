// **Le traduzioni della scheda, scritte dall'AI alla pubblicazione.**
//
// Chiesto dall'utente il 04/09/2026: «quando pubblichi su Shopify imposta
// automaticamente le traduzioni». Le lingue sono le otto del negozio (stesso
// elenco fisso e dichiarato di `traduzioni-shopify.ts`: leggere quelle vere
// vorrebbe `read_locales`, che i token non hanno). Si traducono titolo e
// descrizione; il modello riceve il testo italiano e restituisce un JSON per
// lingua. Non inventa: traduce quello che c'è, e i nomi propri (Deluxy, i nomi
// dei prodotti) restano com'erano.

import { leggiSegreto } from "./segreti";

const MODELLO = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

export const LINGUE_NEGOZIO = [
  { codice: "en", nome: "Inglese" },
  { codice: "fr", nome: "Francese" },
  { codice: "de", nome: "Tedesco" },
  { codice: "es", nome: "Spagnolo" },
  { codice: "ru", nome: "Russo" },
  { codice: "zh-CN", nome: "Cinese semplificato" },
  { codice: "ar", nome: "Arabo" },
  { codice: "ja", nome: "Giapponese" },
] as const;

export type Traduzione = { locale: string; titolo: string; descrizione: string };

export type EsitoTraduzioni = { ok: true; traduzioni: Traduzione[] } | { ok: false; errore: string };

/**
 * Traduce titolo e descrizione. Con `lingue` si chiedono **solo quelle**.
 *
 * ⚠️ **Perché il parametro esiste (08/09/2026).** L'elenco fisso qui sopra dice
 * «le otto lingue del negozio», ma misurando i quattro negozi si è visto che
 * **non è vero per nessuno**: attive sono `en` ovunque, più `fr` su Flowers e
 * `ru` su Gifts. Scrivere le altre non è inutile, è **un errore**: Shopify
 * risponde «Locale is not a valid locale for the shop» e **rifiuta l'intero
 * lotto**, quindi una lingua non attiva faceva perdere anche le traduzioni
 * buone che le stavano accanto. Chiedendo al modello solo le lingue vere si
 * paga meno e si scrive quello che il negozio accetta.
 */
export async function traduciScheda(
  testi: { titolo: string; descrizione: string },
  lingue?: readonly string[]
): Promise<EsitoTraduzioni> {
  const chiave = await leggiSegreto("OPENAI_API_KEY");
  if (!chiave) return { ok: false, errore: "Chiave OpenAI non configurata: le traduzioni non partono." };
  if (!testi.titolo.trim()) return { ok: false, errore: "Niente da tradurre: manca il titolo." };
  const richieste = lingue?.length
    ? LINGUE_NEGOZIO.filter((l) => lingue.some((x) => x.toLowerCase() === l.codice.toLowerCase()))
    : LINGUE_NEGOZIO;
  if (richieste.length === 0) return { ok: false, errore: "Nessuna delle lingue chieste è fra quelle che l'app sa tradurre." };

  const istruzioni = `Sei il traduttore di Deluxy, maison italiana di fiori, torte e regali di lusso.
Traduci il titolo e la descrizione di una scheda prodotto dall'italiano nelle lingue richieste.

Regole:
- Traduci fedelmente: non aggiungere informazioni, non toglierne, non riassumere.
- I nomi propri e i nomi di prodotto restano come sono (es. «Deluxy», «Bouquet Ora Blu» può restare «Bouquet Ora Blu»).
- Mantieni la formattazione: se la descrizione ha paragrafi separati da riga vuota o punti elenco, tienili.
- Tono da maison: sobrio e preciso.

Rispondi SOLO in JSON, con questa forma:
{ "traduzioni": [ { "locale": "en", "titolo": "...", "descrizione": "..." }, ... ] }
Le lingue, in questo ordine e con questi codici: ${richieste.map((l) => `${l.codice} (${l.nome})`).join(", ")}.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` },
      body: JSON.stringify({
        model: MODELLO,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: istruzioni },
          { role: "user", content: JSON.stringify({ titolo: testi.titolo, descrizione: testi.descrizione }) },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(res.status === 401 ? "Chiave OpenAI rifiutata (401)." : `OpenAI ha risposto ${res.status}. ${t.slice(0, 160)}`);
    }
    const corpo = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const contenuto = corpo.choices?.[0]?.message?.content;
    if (!contenuto) throw new Error("Risposta del modello vuota.");
    const g = JSON.parse(contenuto) as { traduzioni?: { locale?: string; titolo?: string; descrizione?: string }[] };
    const valide = new Set<string>(richieste.map((l) => l.codice));
    const traduzioni: Traduzione[] = (g.traduzioni ?? [])
      .filter((t) => t.locale && valide.has(t.locale) && t.titolo?.trim())
      .map((t) => ({ locale: t.locale as string, titolo: (t.titolo as string).trim(), descrizione: (t.descrizione ?? "").trim() }));
    if (traduzioni.length === 0) throw new Error("Il modello non ha prodotto traduzioni leggibili.");
    return { ok: true, traduzioni };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : "Errore sconosciuto nella traduzione." };
  }
}

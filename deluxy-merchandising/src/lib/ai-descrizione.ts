// Scrittura AI delle descrizioni di prodotto.
//
// Copia la modalità dell'app reale (app.deluxy.it): il **prompt sta sulla
// categoria**, non sul singolo prodotto. Chi conosce il prodotto scrive una
// volta come si racconta quella famiglia — le torte non si descrivono come i
// bouquet — e da lì in poi ogni descrizione parte già nella lingua giusta.
//
// Due regole, le stesse della lettura AI del trend:
// 1. Il modello riceve **dati veri** (nome, categoria, materiali, prezzo,
//    varianti) e non inventa quello che non gli è stato dato: niente misure,
//    tempi di consegna o composizioni che nessuno ha scritto.
// 2. Non pubblica niente. Scrive un testo che una persona rilegge, corregge e
//    salva: la descrizione arriva nel campo del form, non su Shopify.

import { prisma } from "./db";
import { etichettaCategoria } from "./dominio";
import { leggiSegreto } from "./segreti";

const MODELLO = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

export type DatiProdotto = {
  nome: string;
  categoria: string; // chiave del catalogo
  tipo: string; // il "product type" scritto a mano nel form
  materiali: string;
  prezzo: string;
  varianti: string[];
  tono: string; // "maison" | "caldo" | "essenziale"
};

export type EsitoDescrizione =
  | { ok: true; claim: string; descrizione: string; punti: string[]; modello: string }
  | { ok: false; errore: string; configurata: boolean };

const TONI: Record<string, string> = {
  maison: "Voce da maison: sobria, precisa, mai svenevole. Frasi brevi.",
  caldo: "Voce calda e vicina, come chi consiglia un regalo a un amico. Niente svenevolezze.",
  essenziale: "Voce essenziale e concreta: dice cos'è e a chi serve, senza aggettivi di troppo.",
};

/** Il prompt che una persona ha scritto per quella categoria, se c'è. */
export async function promptDiCategoria(categoria: string): Promise<string | null> {
  if (!categoria) return null;
  const riga = await prisma.promptCategoria.findUnique({ where: { categoria } });
  return riga?.prompt?.trim() || null;
}

export async function generaDescrizione(d: DatiProdotto): Promise<EsitoDescrizione> {
  const chiave = await leggiSegreto("OPENAI_API_KEY");
  if (!chiave) {
    return {
      ok: false,
      configurata: false,
      errore:
        "Chiave OpenAI non configurata: impostala in Negozi & permessi (oppure come OPENAI_API_KEY nell'ambiente).",
    };
  }
  if (!d.nome.trim()) return { ok: false, configurata: true, errore: "Serve almeno il nome del prodotto." };

  const promptCategoria = await promptDiCategoria(d.categoria);

  const istruzioni = `Scrivi la scheda prodotto per un negozio online di Deluxy, maison italiana di fiori, torte e regali di lusso.

${TONI[d.tono] ?? TONI.maison}

Regole non negoziabili:
- Usa SOLO le informazioni che ti vengono date. Non inventare misure, numero di fiori, tempi di consegna, provenienze, premi o materiali che non sono scritti.
- Se un'informazione manca, scrivi il testo senza quella informazione: non riempire il buco con una frase generica che potrebbe essere falsa.
- Niente superlativi a raffica ("straordinario", "unico al mondo"), niente emoji, niente promesse di consegna.
- Italiano corretto, seconda persona solo se serve.
${promptCategoria ? `\nIndicazioni di questa categoria, scritte da chi la cura — hanno la precedenza sul resto:\n${promptCategoria}` : ""}

Rispondi SOLO in JSON:
{
  "claim": "una riga sotto il titolo, max 90 caratteri",
  "descrizione": "2-3 paragrafi separati da una riga vuota",
  "punti": ["3-5 punti brevi: composizione, formato, occasione — solo se supportati dai dati"]
}`;

  const dati = {
    nome: d.nome,
    categoria: etichettaCategoria(d.categoria),
    tipoScrittoDalOperatore: d.tipo || null,
    materialiOComposizione: d.materiali || null,
    prezzo: d.prezzo || null,
    varianti: d.varianti.filter(Boolean),
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` },
      body: JSON.stringify({
        model: MODELLO,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: istruzioni },
          { role: "user", content: JSON.stringify(dati) },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });

    if (!res.ok) {
      const testo = await res.text().catch(() => "");
      throw new Error(
        res.status === 401 ? "Chiave OpenAI rifiutata (401)." : `OpenAI ha risposto ${res.status}. ${testo.slice(0, 160)}`
      );
    }
    const corpo = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const contenuto = corpo.choices?.[0]?.message?.content;
    if (!contenuto) throw new Error("Risposta del modello vuota.");

    const g = JSON.parse(contenuto) as { claim?: string; descrizione?: string; punti?: string[] };
    if (!g.descrizione) throw new Error("Il modello non ha prodotto una descrizione leggibile.");

    return {
      ok: true,
      claim: (g.claim ?? "").trim(),
      descrizione: g.descrizione.trim(),
      punti: Array.isArray(g.punti) ? g.punti.filter((p) => typeof p === "string" && p.trim()) : [],
      modello: MODELLO,
    };
  } catch (e) {
    return {
      ok: false,
      configurata: true,
      errore: e instanceof Error ? e.message : "Errore sconosciuto nella generazione.",
    };
  }
}

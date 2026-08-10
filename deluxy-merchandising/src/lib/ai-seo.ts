// Scrittura AI del SEO di una collezione.
//
// Stesse regole della scrittura delle descrizioni (ai-descrizione.ts):
// 1. Il modello riceve **dati veri** — titolo, descrizione, condizioni della
//    collezione, i prodotti che vendono davvero — e non inventa quello che non
//    gli è stato dato: niente «consegna in 30 minuti» se nessuno l'ha scritto.
// 2. **Non pubblica niente.** Scrive una bozza nei campi «nostri» del SEO, che
//    una persona rilegge e manda al negozio quando vuole: il testo che i
//    clienti leggono su Google non cambia finché non si preme «Manda».

import { prisma } from "./db";
import { descriviRegole } from "./collezioni";
import { FILTRO_BUON_FINE, finestra } from "./vendite";
import { leggiSegreto } from "./segreti";

const MODELLO = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

export type EsitoSeo =
  | { ok: true; titolo: string; descrizione: string; modello: string }
  | { ok: false; errore: string };

export async function generaSeoCollezione(id: string): Promise<EsitoSeo> {
  const chiave = await leggiSegreto("OPENAI_API_KEY");
  if (!chiave) {
    return {
      ok: false,
      errore: "Chiave OpenAI non configurata: si imposta in Negozi & permessi (oppure OPENAI_API_KEY nell'ambiente).",
    };
  }

  const c = await prisma.collezioneShopify.findUnique({
    where: { id },
    select: { titolo: true, handle: true, descrizione: true, negozio: true, regole: true },
  });
  if (!c) return { ok: false, errore: "Collezione non trovata." };

  // Le linee guida del brand, scritte in Impostazioni da chi lo cura: hanno la
  // precedenza sulle regole generiche, come il prompt di categoria per le
  // descrizioni.
  const negozio = await prisma.negozioShopify.findFirst({
    where: { nome: c.negozio },
    select: { lineeGuidaSeo: true },
  });
  const guida = negozio?.lineeGuidaSeo?.trim() || null;

  // I prodotti che questa collezione vende davvero: sono l'argomento più
  // concreto che il testo possa usare, e sono verificabili — non un elenco di
  // parole chiave immaginate.
  const f = finestra(90);
  const top = await prisma.vendita.groupBy({
    by: ["prodottoId"],
    where: {
      data: { gte: f.dal, lte: f.al },
      ...FILTRO_BUON_FINE,
      // Stesse esclusioni del resto del venduto: righe di servizio e archiviati
      // non sono argomenti per un testo che parla ai clienti.
      prodotto: {
        collezioniShopify: { some: { collezioneId: id } },
        fase: { not: "archiviato" },
        esclusoDaAnalisi: false,
      },
    },
    _sum: { ricavo: true },
    orderBy: { _sum: { ricavo: "desc" } },
    take: 8,
  });
  // findMany non conserva l'ordine dell'IN: si rimette quello della classifica,
  // perché «i più venduti» dal primo all'ottavo è un'informazione, un elenco
  // mescolato no (trovato dalla revisione).
  let nomi: string[] = [];
  if (top.length) {
    const schede = await prisma.prodotto.findMany({
      where: { id: { in: top.map((t) => t.prodottoId as string) } },
      select: { id: true, nome: true },
    });
    const perId = new Map(schede.map((p) => [p.id, p.nome]));
    nomi = top.map((t) => perId.get(t.prodottoId as string)).filter((x): x is string => !!x);
  }

  const istruzioni = `Scrivi il SEO (meta title e meta description) per una collezione del negozio online di Deluxy, maison italiana di fiori, torte e regali di lusso con consegna a domicilio.

Regole non negoziabili:
- Usa SOLO le informazioni date. Non inventare tempi di consegna, città, sconti, premi o quantità che non sono scritti.
- Titolo: massimo 60 caratteri, la parola più importante all'inizio, niente nome del sito.
- Descrizione: massimo 160 caratteri, una frase che dice cosa si trova e perché sceglierla, senza superlativi a raffica né emoji.
- Italiano corretto.

${guida ? `\nIndicazioni di questo brand, scritte da chi lo cura — hanno la precedenza sul resto:\n${guida}\n` : ""}
Rispondi SOLO in JSON: { "titolo": "...", "descrizione": "..." }`;

  const dati = {
    collezione: c.titolo,
    descrizioneAttuale: c.descrizione || null,
    condizioniDiIngresso: descriviRegole(c.regole),
    prodottiPiuVenduti: nomi,
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` },
      body: JSON.stringify({
        model: MODELLO,
        temperature: 0.6,
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
        res.status === 401 ? "Chiave OpenAI rifiutata (401)." : `OpenAI ha risposto ${res.status}. ${testo.slice(0, 160)}`,
      );
    }
    const corpo = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const contenuto = corpo.choices?.[0]?.message?.content;
    if (!contenuto) throw new Error("Risposta del modello vuota.");
    const g = JSON.parse(contenuto) as { titolo?: string; descrizione?: string };
    if (!g.titolo?.trim() || !g.descrizione?.trim()) throw new Error("Il modello non ha prodotto titolo e descrizione.");
    return { ok: true, titolo: g.titolo.trim(), descrizione: g.descrizione.trim(), modello: MODELLO };
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : "Errore sconosciuto nella generazione." };
  }
}

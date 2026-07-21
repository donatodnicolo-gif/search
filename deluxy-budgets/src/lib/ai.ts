// CFO — proposte di riconciliazione con AI.
// L'AI riceve le controparti bancarie non ancora categorizzate e le categorie
// di costo disponibili, e propone per ciascuna la categoria più probabile con
// confidenza e motivo. NON applica nulla: è l'utente a confermare (le proposte
// diventano regole solo su conferma).
//
// Usa la stessa infrastruttura delle altre app Deluxy: SDK OpenAI, chiave in
// OPENAI_API_KEY, modello in OPENAI_MODEL (default gpt-4o-mini). Segreti in
// .env, mai committati.
import OpenAI from "openai";
import { chiave as chiaveVault } from "./chiavi";

const MODELLO = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

let clientCache: OpenAI | null = null;
// La chiave OpenAI arriva dalla cassaforte del Hub (o dall'env locale in dev).
async function client(): Promise<OpenAI | null> {
  const apiKey = (await chiaveVault("OPENAI_API_KEY"))?.replace(/\s+/g, "");
  if (!apiKey) return null;
  clientCache ??= new OpenAI({ apiKey, timeout: 60_000, maxRetries: 2 });
  return clientCache;
}

export async function aiConfigurata(): Promise<boolean> {
  return Boolean(await chiaveVault("OPENAI_API_KEY"));
}

export type Confidenza = "alta" | "media" | "bassa";

export type PropostaAI = {
  controparte: string;
  categoria: string | null; // nome categoria proposto, null = incerta
  confidenza: Confidenza;
  motivo: string;
};

export type EsitoProposte =
  | { ok: true; proposte: PropostaAI[] }
  | { ok: false; errore: string; configurata: boolean };

// ---- Studio del piano di categorie a partire dagli addebiti reali ----

export type CategoriaProposta = {
  nome: string;
  tipoPL: string; // COGS | ADV | PERSONALE | STRUTTURA | ESCLUSA
  motivo: string;
  controparti: string[]; // nomi esatti tra quelli forniti
};

export type EsitoCategorie =
  | { ok: true; categorie: CategoriaProposta[] }
  | { ok: false; errore: string; configurata: boolean };

const TIPI_PL_VALIDI = ["COGS", "ADV", "PERSONALE", "STRUTTURA", "ESCLUSA"];

// L'AI legge le controparti bancarie (nome + importo) e PROGETTA un piano di
// categorie di costo che le organizzi tutte, assegnando ad ognuna la voce di
// P&L. Non scrive nulla: restituisce la proposta, che l'utente conferma.
export async function studiaCategorie(
  controparti: { controparte: string; uscite: number }[],
  esistenti: { nome: string; tipoPL: string }[]
): Promise<EsitoCategorie> {
  const cli = await client();
  if (!cli) {
    return { ok: false, configurata: false, errore: "Chiave OpenAI non trovata nel Hub (né in locale)." };
  }
  if (controparti.length === 0) return { ok: true, categorie: [] };

  const nomiInput = new Set(controparti.map((c) => c.controparte));
  const elenco = controparti
    .map((c, i) => `${i + 1}. ${c.controparte} — ${Math.round(c.uscite)} €`)
    .join("\n");
  const giaEsistenti = esistenti.length
    ? `Categorie già esistenti (riusale se calzano, non duplicarle):\n${esistenti.map((e) => `- ${e.nome} (${e.tipoPL})`).join("\n")}\n\n`
    : "";

  const sistema =
    "Sei il CFO di Deluxy, azienda italiana di consegne di fiori e torte in guanti bianchi. " +
    "Ti do l'elenco reale delle controparti dei bonifici in uscita, con gli importi. " +
    "Progetta un PIANO DI CATEGORIE DI COSTO che le organizzi tutte, in modo che un imprenditore " +
    "capisca dove vanno i soldi. Raggruppa le controparti simili sotto la stessa categoria (es. i vari " +
    "fioristi e pasticcerie sotto 'Fornitori fiori e torte'; Google/Meta/TikTok sotto 'Pubblicità'; " +
    "Agenzia Entrate/INPS/F24 sotto 'Tasse e contributi'; affitti/utenze/software sotto voci di struttura; " +
    "commissioni e interessi bancari sotto oneri finanziari). " +
    "Per ogni categoria indica la voce di conto economico (tipoPL): COGS = costo del venduto/fornitori di " +
    "prodotto; ADV = pubblicità; PERSONALE = stipendi/compensi; STRUTTURA = affitti, utenze, software, " +
    "servizi generali; ESCLUSA = movimenti che non sono costi economici (oneri finanziari, giroconti, " +
    "rimborsi). Fai 8–16 categorie, nomi in italiano specifici ma non frammentati, e assegna OGNI " +
    "controparte importante a una categoria (usa i nomi esatti che ti ho dato). Motivo brevissimo per categoria.";

  const utente =
    `${giaEsistenti}CONTROPARTI (nome — uscita):\n${elenco}\n\n` +
    'Rispondi SOLO con JSON: {"categorie":[{"nome":"<categoria>","tipoPL":"COGS|ADV|PERSONALE|STRUTTURA|ESCLUSA","motivo":"<breve>","controparti":["<nome esatto>", …]}]}';

  try {
    const risposta = await cli.chat.completions.create({
      model: MODELLO,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: utente },
      ],
    });
    const testo = risposta.choices[0]?.message?.content ?? "{}";
    const dati = JSON.parse(testo) as { categorie?: unknown };
    const categorie: CategoriaProposta[] = Array.isArray(dati.categorie)
      ? (dati.categorie as Record<string, unknown>[])
          .map((c) => ({
            nome: String(c.nome ?? "").trim().slice(0, 60),
            tipoPL: TIPI_PL_VALIDI.includes(String(c.tipoPL)) ? String(c.tipoPL) : "STRUTTURA",
            motivo: String(c.motivo ?? "").slice(0, 120),
            controparti: Array.isArray(c.controparti)
              ? [...new Set((c.controparti as unknown[]).map(String))].filter((n) => nomiInput.has(n))
              : [],
          }))
          .filter((c) => c.nome)
      : [];
    return { ok: true, categorie };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "errore sconosciuto";
    return { ok: false, configurata: true, errore: `Chiamata AI non riuscita: ${msg}` };
  }
}

type ControparteIn = { controparte: string; uscite: number };
type CategoriaIn = { nome: string; tipoPL: string };

// Chiede all'AI di assegnare ogni controparte a una delle categorie date.
export async function proponiRiconciliazioni(
  controparti: ControparteIn[],
  categorie: CategoriaIn[]
): Promise<EsitoProposte> {
  const cli = await client();
  if (!cli) {
    return {
      ok: false,
      configurata: false,
      errore: "Chiave OpenAI non trovata nel Hub (né in locale): le proposte AI sono spente.",
    };
  }
  if (controparti.length === 0) return { ok: true, proposte: [] };
  if (categorie.length === 0) {
    return { ok: false, configurata: true, errore: "Crea almeno una categoria di costo prima di usare l'AI." };
  }

  const elencoCat = categorie.map((c) => `- ${c.nome} (voce P&L: ${c.tipoPL})`).join("\n");
  const elencoContro = controparti
    .map((c, i) => `${i + 1}. ${c.controparte} — ${Math.round(c.uscite)} €`)
    .join("\n");

  const sistema =
    "Sei il CFO di Deluxy, azienda italiana di consegne di fiori e torte in guanti bianchi. " +
    "Riclassifichi gli addebiti bancari nelle categorie di costo aziendali. " +
    "Assegna ogni controparte alla categoria più probabile fra quelle fornite, in base al nome. " +
    "Fornitori di fiori/piante e pasticcerie vanno ai costi del venduto; enti come Agenzia delle Entrate, " +
    "INPS, F24 a tasse/personale secondo la categoria disponibile; Google/Meta/TikTok a pubblicità; " +
    "affitti, utenze, software alla struttura; commissioni e interessi bancari agli oneri finanziari. " +
    "Se non sei ragionevolmente sicuro, metti categoria null e confidenza bassa. Non inventare categorie " +
    "diverse da quelle elencate. Rispondi in italiano, motivo brevissimo (max 8 parole).";

  const utente =
    `CATEGORIE DISPONIBILI:\n${elencoCat}\n\n` +
    `CONTROPARTI DA CLASSIFICARE:\n${elencoContro}\n\n` +
    'Rispondi SOLO con JSON: {"proposte":[{"controparte":"<nome esatto>","categoria":"<nome categoria o null>","confidenza":"alta|media|bassa","motivo":"<breve>"}]}';

  try {
    const risposta = await cli.chat.completions.create({
      model: MODELLO,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: utente },
      ],
    });
    const testo = risposta.choices[0]?.message?.content ?? "{}";
    const dati = JSON.parse(testo) as { proposte?: unknown };
    const nomiValidi = new Set(categorie.map((c) => c.nome));
    const proposte: PropostaAI[] = Array.isArray(dati.proposte)
      ? (dati.proposte as Record<string, unknown>[]).map((p) => {
          const cat = typeof p.categoria === "string" && nomiValidi.has(p.categoria) ? p.categoria : null;
          const conf = (["alta", "media", "bassa"] as const).includes(p.confidenza as Confidenza)
            ? (p.confidenza as Confidenza)
            : "bassa";
          return {
            controparte: String(p.controparte ?? ""),
            categoria: cat,
            confidenza: cat ? conf : "bassa",
            motivo: String(p.motivo ?? "").slice(0, 120),
          };
        })
      : [];
    return { ok: true, proposte };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "errore sconosciuto";
    return { ok: false, configurata: true, errore: `Chiamata AI non riuscita: ${msg}` };
  }
}

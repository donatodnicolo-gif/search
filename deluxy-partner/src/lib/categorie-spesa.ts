import { chiave, env } from "./env";

// Le CATEGORIE DI COSTO arrivano da **deluxy-budgets**, non da qui.
//
// Perché: sono le categorie con cui si costruisce il conto economico (COGS,
// ADV, personale, struttura), e quella è l'app che fa il bilancio. Se Finance
// se ne tenesse un elenco proprio, prima o poi i due elenchi divergerebbero e
// verrebbero fuori due bilanci diversi dagli stessi movimenti. Qui si legge e
// basta: creare o rinominare una categoria si fa in Budgets.
//
// Env: BUDGETS_URL (default produzione) + BUDGETS_API_KEY (la chiave la emette
// Budgets, Configurazione → Chiavi).

export type CategoriaCosto = {
  id: string;
  nome: string;
  tipoPL: string;
  // La stessa categoria vista dal **bilancio civilistico** (B6, B7, B9, B14…).
  // `null` = nessuno l'ha ancora decisa in Budgets.
  voceCE?: string | null;
  // **Cosa ci va dentro e cosa no.** Arriva da Budgets ed è la riga che evita di
  // indovinare: qui davanti al movimento è dove si assegna davvero a mano.
  descrizione?: string | null;
  // **Non è un costo: è denaro dei partner** (modello C). Un bonifico a un
  // fioraio che ha eseguito un ordine ecommerce è la sua quota, non una spesa
  // di Deluxy — nei ricavi c'è già solo la parte che resta a noi. Contarlo come
  // costo toglierebbe due volte lo stesso denaro.
  quotaPartner?: boolean;
  colore: string | null;
  ordine: number;
  regole?: { match: string; esatto: boolean }[];
};

// ⚠️ **Le etichette devono dire quello che dicono in Budgets.** Qui c'era
// «Costo del venduto», che in Budgets è stato rinominato il 26/07/2026 proprio
// perché era sbagliato: se la quota del partner è già tolta dai ricavi non è
// *anche* un costo, e quella voce è quanto si paga ai valet per la consegna.
// Due app che chiamano in due modi la stessa voce di conto economico sono un
// modo garantito di far litigare due numeri identici.
export const TIPI_PL: Record<string, { label: string; badge: string }> = {
  COGS: { label: "Costo per servizi (valet)", badge: "orange" },
  ADV: { label: "Marketing e ADV", badge: "purple" },
  PERSONALE: { label: "Personale", badge: "blue" },
  STRUTTURA: { label: "Struttura", badge: "neutral" },
  // «ESCLUSA» non vuol dire «da ignorare»: vuol dire che non è un costo di
  // gestione (banca, tasse, quota dei partner) e resta fuori dal conto
  // economico. Scritto male, qualcuno ci metterebbe dentro le spese che non ha
  // voglia di classificare.
  ESCLUSA: { label: "Fuori dal conto economico", badge: "gold" },
};

function baseUrl(): string {
  return (env("BUDGETS_URL") || "https://deluxy-budgets.vercel.app").replace(/\/$/, "");
}

export function budgetsConfigurato(): boolean {
  return Boolean(env("BUDGETS_API_KEY"));
}

// Cache in memoria per istanza: le categorie cambiano di rado e questa lista
// serve a ogni riga di ogni pagina delle spese. TTL breve, così una categoria
// aggiunta in Budgets compare qui da sé.
let cache: { valore: CategoriaCosto[]; scadenza: number } | null = null;
const TTL_MS = 5 * 60_000;

export type EsitoCategorie =
  | { ok: true; categorie: CategoriaCosto[] }
  | { ok: false; errore: string };

export async function categorieDaBudgets(conRegole = false): Promise<EsitoCategorie> {
  const key = chiave("BUDGETS_API_KEY");
  if (!key) {
    return {
      ok: false,
      errore: "BUDGETS_API_KEY non configurata: senza, le categorie di costo non si possono leggere da Budgets.",
    };
  }
  if (!conRegole && cache && cache.scadenza > Date.now()) return { ok: true, categorie: cache.valore };

  try {
    const res = await fetch(`${baseUrl()}/api/v1/categorie${conRegole ? "?regole=1" : ""}`, {
      headers: { "x-api-key": key },
      cache: "no-store",
      // Budgets non deve poter bloccare una pagina di Finance.
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 401) return { ok: false, errore: "Chiave rifiutata da Budgets (401): controlla BUDGETS_API_KEY." };
    if (!res.ok) return { ok: false, errore: `Budgets ha risposto ${res.status}.` };
    const j = (await res.json()) as { categorie?: CategoriaCosto[] };
    const categorie = j.categorie ?? [];
    if (!conRegole) cache = { valore: categorie, scadenza: Date.now() + TTL_MS };
    return { ok: true, categorie };
  } catch (e) {
    // Se c'è una copia in cache la si usa: meglio un elenco di 5 minuti fa che
    // una pagina che non funziona perché l'altra app è giù.
    if (cache) return { ok: true, categorie: cache.valore };
    return { ok: false, errore: `Budgets non raggiungibile: ${(e as Error).message}` };
  }
}

export type PropostaAI = {
  controparte: string;
  categoria: string | null; // NOME di una categoria esistente, o null se incerta
  confidenza: "alta" | "media" | "bassa";
  motivo: string;
};

/** Chiede a **Budgets** di far proporre all'AI la categoria per un elenco di
 *  controparti. L'AI non sta qui apposta: quella di Budgets ha già il prompt
 *  tarato su Deluxy (fiori e pasticcerie ai costi del venduto, F24 alle tasse,
 *  Google/Meta alla pubblicità) e le categorie sono sue. Due AI diverse sulla
 *  stessa spesa darebbero due risposte diverse. */
export async function proponiConAI(
  controparti: { controparte: string; uscite: number }[]
): Promise<{ ok: true; proposte: PropostaAI[] } | { ok: false; errore: string }> {
  const key = chiave("BUDGETS_API_KEY");
  if (!key) return { ok: false, errore: "BUDGETS_API_KEY non configurata: le proposte AI passano da Budgets." };
  try {
    const res = await fetch(`${baseUrl()}/api/v1/categorie/proponi`, {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ controparti }),
      // L'AI ci mette qualche secondo per lotto: qui serve più pazienza che altrove.
      signal: AbortSignal.timeout(90000),
    });
    if (res.status === 401) return { ok: false, errore: "Chiave rifiutata da Budgets (401): controlla BUDGETS_API_KEY." };
    if (!res.ok) return { ok: false, errore: `Budgets ha risposto ${res.status}.` };
    const j = (await res.json()) as { proposte?: PropostaAI[]; errore?: string };
    if (j.errore) return { ok: false, errore: j.errore };
    return { ok: true, proposte: j.proposte ?? [] };
  } catch (e) {
    return { ok: false, errore: `Budgets non raggiungibile: ${(e as Error).message}` };
  }
}

// Il nome come lo confronta Budgets: minuscolo, spazi ripetuti schiacciati,
// niente spazi ai bordi. Vale sia per il nome della controparte sia per il
// testo della regola — se una delle due parti non è normalizzata il confronto
// esatto non scatta, ed è quello che stava succedendo.
const normalizza = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** La categoria suggerita dalle REGOLE di Budgets per una controparte.
 *  Stesso criterio dell'originale: vince il `match` più lungo, così una regola
 *  specifica batte una generica ("ENEL ENERGIA" batte "ENEL"). Torna null se
 *  nessuna regola risponde: meglio «non categorizzata» che categorizzata a caso.
 *
 *  ⚠️ **Il nome va normalizzato prima di confrontarlo, e per un motivo misurato**
 *  (31/07/2026): 2.411 delle 2.500 regole di Budgets sono a **match esatto**, e
 *  un match esatto contro `" Alice Angelotti"` con lo spazio davanti non scatta
 *  mai. Budgets non se ne accorgeva perché riceve i nomi **già aggregati e
 *  ripuliti** da `/api/spese`, mentre qui si confronta il campo grezzo del
 *  movimento. Risultato: 54 movimenti del 2026 per 4.078 € che Budgets
 *  classificava e Finance no — cioè le due app in disaccordo per un motivo che
 *  non c'entra niente con la contabilità. */
export function categoriaDaRegole(
  controparte: string | null,
  descrizione: string,
  categorie: CategoriaCosto[]
): CategoriaCosto | null {
  const testo = normalizza(controparte ?? descrizione ?? "");
  if (!testo) return null;

  let vincente: { cat: CategoriaCosto; lunghezza: number } | null = null;
  for (const c of categorie) {
    for (const r of c.regole ?? []) {
      const m = normalizza(r.match);
      if (!m) continue;
      const colpisce = r.esatto ? testo === m : testo.includes(m);
      if (colpisce && (!vincente || m.length > vincente.lunghezza)) {
        vincente = { cat: c, lunghezza: m.length };
      }
    }
  }
  return vincente?.cat ?? null;
}

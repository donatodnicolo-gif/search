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
  colore: string | null;
  ordine: number;
  regole?: { match: string; esatto: boolean }[];
};

export const TIPI_PL: Record<string, { label: string; badge: string }> = {
  COGS: { label: "Costo del venduto", badge: "orange" },
  ADV: { label: "Marketing e ADV", badge: "purple" },
  PERSONALE: { label: "Personale", badge: "blue" },
  STRUTTURA: { label: "Struttura", badge: "neutral" },
  // «ESCLUSA» non vuol dire «da ignorare»: vuol dire che non è un costo di
  // gestione (banca, tasse) e resta fuori dal margine. Scritto male, qualcuno
  // ci metterebbe dentro le spese che non ha voglia di classificare.
  ESCLUSA: { label: "Fuori dal margine", badge: "gold" },
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

/** La categoria suggerita dalle REGOLE di Budgets per una controparte.
 *  Stesso criterio dell'originale: vince il `match` più lungo, così una regola
 *  specifica batte una generica ("ENEL ENERGIA" batte "ENEL"). Torna null se
 *  nessuna regola risponde: meglio «non categorizzata» che categorizzata a caso. */
export function categoriaDaRegole(
  controparte: string | null,
  descrizione: string,
  categorie: CategoriaCosto[]
): CategoriaCosto | null {
  const testo = (controparte ?? descrizione ?? "").toLowerCase();
  if (!testo.trim()) return null;

  let vincente: { cat: CategoriaCosto; lunghezza: number } | null = null;
  for (const c of categorie) {
    for (const r of c.regole ?? []) {
      const m = r.match.trim().toLowerCase();
      if (!m) continue;
      const colpisce = r.esatto ? testo === m : testo.includes(m);
      if (colpisce && (!vincente || m.length > vincente.lunghezza)) {
        vincente = { cat: c, lunghezza: m.length };
      }
    }
  }
  return vincente?.cat ?? null;
}

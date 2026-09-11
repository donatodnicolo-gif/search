import { chiaveApp } from "./chiavi-app";

// Creare un ordine con link di pagamento, PASSANDO DAL CUSTOMER SERVICE
// (/api/v1/nuovo-ordine): è lui che possiede le credenziali Shopify con lo
// scope giusto e la logica della bozza d'ordine. L'ordine vero lo fa Shopify
// e rientra dal registro Orders come tutti gli altri — il CRM non scrive
// ordini da nessuna parte.

const BASE_DEFAULT = "https://deluxy-messaging.vercel.app";
const TIMEOUT_MS = 12_000;

async function base(): Promise<string> {
  return ((await chiaveApp("MESSAGGI_URL")) ?? BASE_DEFAULT).replace(/\/$/, "");
}

async function chiave(): Promise<string | null> {
  return chiaveApp("MESSAGGI_API_KEY");
}

export type NegozioCS = { id: string; nome: string; dominio: string };

export type ProdottoCS = {
  variantId: string;
  titolo: string;
  variante: string;
  prezzo: number;
  valuta: string;
  immagine: string;
  disponibile: boolean;
};

export type SpedizioneCS = { titolo: string; prezzo: number; usata: number };

// Le OPZIONI del modulo, dette dal Customer Service (11/09/2026: «copia tutte le
// opzioni da app customer service, chiedi espressamente all'app quali ha»).
// Fasce dagli orari del negozio (o storiche se non ha orari scritti), voci di
// spedizione usate, metodi di pagamento, IVA, e l'elenco dei campi facoltativi.
export type GiornoCS = { data: string; quando: string; ok: boolean; motivo: string; fasce: string[] };
export type OpzioniCS = {
  negozio: { id: string; nome: string; dominio: string };
  fasce: { configurato: boolean; primoGiornoAperto: string | null; oltre: string[]; calendario: GiornoCS[]; storiche?: string[] };
  spedizioni: SpedizioneCS[];
  tariffe: { come: string; corpo: string; nota: string };
  metodiPagamento: { nome: string; usato: number }[];
  iva: { aggiungibile: boolean; predefinito: boolean; spiegazione: string };
  campi: { nome: string; tipo: string; spiegazione: string }[];
};

export type TariffaCS = { titolo: string; prezzo: number; valuta: string };
export type StimaCS = { partenza: string; km: number; base: number; baseTitolo: string; euroPerKm: number; prezzo: number };
export type RichiestaTariffeCS = {
  negozioId: string;
  indirizzo: { indirizzo: string; citta: string; cap: string; provincia: string; paese: string };
  righe: RigaNuovoOrdine[];
};
export type RispostaTariffeCS = {
  tariffe: TariffaCS[];
  stima?: StimaCS | null;
  stimaStato?: string;
  stimaKm?: number | null;
  stimaPartenza?: string;
};

export type RigaNuovoOrdine = { variantId?: string; titolo?: string; prezzo?: number; quantita: number };

export type DatiCreazione = {
  negozioId: string;
  cliente: { nome: string; cognome: string; email: string; telefono: string };
  consegna: {
    data: string;
    fascia: string;
    indirizzo: string;
    civicoNote: string;
    cap: string;
    citta: string;
    provincia: string;
    paese: string;
  };
  righe: RigaNuovoOrdine[];
  biglietto: string;
  spedizione: { titolo: string; prezzo: number };
  pagamento: "link" | "pagato";
  mezzoPagamento: string;
  // I campi facoltativi, gli stessi della schermata interna del CS (11/09).
  destinatario?: { nome: string; cognome: string; telefono: string };
  anonima?: boolean;
  consensoMarketing?: boolean;
  aggiungiIva?: boolean;
  eccezioneOrari?: string;
  operatore?: { id: string; nome: string };
};

export type EsitoCreazione =
  | { ok: true; bozzaId: string; linkPagamento: string; ordineNumero: string; inviato: boolean }
  | { ok: false; errore: string };

async function leggi<T>(percorso: string): Promise<{ ok: true; dati: T } | { ok: false; errore: string }> {
  const k = await chiave();
  if (!k) {
    return {
      ok: false,
      errore: "Manca MESSAGGI_API_KEY: la chiave del Customer Service si emette da lì (npm run chiave -- deluxy-crm --scrittura).",
    };
  }
  try {
    const res = await fetch(`${await base()}${percorso}`, {
      headers: { "x-api-key": k },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const corpo = (await res.json().catch(() => null)) as (T & { errore?: string }) | null;
    if (!res.ok) return { ok: false, errore: corpo?.errore ?? `Il Customer Service risponde ${res.status}.` };
    return { ok: true, dati: corpo as T };
  } catch {
    return { ok: false, errore: "Il Customer Service non risponde (timeout o rete)." };
  }
}

export async function negoziCS() {
  return leggi<{ negozi: NegozioCS[] }>("/api/v1/nuovo-ordine/negozi");
}

export async function prodottiCS(negozio: string, q: string) {
  return leggi<{ stato: "ok" | "senza-permesso" | "errore"; prodotti?: ProdottoCS[]; messaggio?: string }>(
    `/api/v1/nuovo-ordine/prodotti?negozio=${encodeURIComponent(negozio)}&q=${encodeURIComponent(q)}`,
  );
}

export async function opzioniCS(negozio: string) {
  return leggi<OpzioniCS>(`/api/v1/nuovo-ordine/opzioni?negozio=${encodeURIComponent(negozio)}`);
}

export async function tariffeCS(corpo: RichiestaTariffeCS): Promise<{ ok: true; dati: RispostaTariffeCS } | { ok: false; errore: string }> {
  const k = await chiave();
  if (!k) return { ok: false, errore: "Manca MESSAGGI_API_KEY." };
  try {
    const res = await fetch(`${await base()}/api/v1/nuovo-ordine/tariffe`, {
      method: "POST",
      headers: { "x-api-key": k, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      // Shopify più Google per la stima: più respiro.
      signal: AbortSignal.timeout(30_000),
    });
    const dati = (await res.json().catch(() => null)) as (RispostaTariffeCS & { errore?: string }) | null;
    if (!res.ok) return { ok: false, errore: dati?.errore ?? `Il Customer Service risponde ${res.status}.` };
    return { ok: true, dati: dati ?? { tariffe: [] } };
  } catch {
    return { ok: false, errore: "Il Customer Service non risponde (timeout o rete)." };
  }
}

export async function spedizioniCS(negozio: string) {
  return leggi<{ spedizioni: SpedizioneCS[] }>(`/api/v1/nuovo-ordine/spedizioni?negozio=${encodeURIComponent(negozio)}`);
}

export async function creaOrdineCS(dati: DatiCreazione): Promise<EsitoCreazione> {
  const k = await chiave();
  if (!k) return { ok: false, errore: "Manca MESSAGGI_API_KEY: impossibile creare l'ordine." };
  try {
    const res = await fetch(`${await base()}/api/v1/nuovo-ordine`, {
      method: "POST",
      headers: { "x-api-key": k, "Content-Type": "application/json" },
      body: JSON.stringify(dati),
      // Shopify di mezzo (token + bozza + invoice): più respiro del solito.
      signal: AbortSignal.timeout(45_000),
    });
    const corpo = (await res.json().catch(() => null)) as EsitoCreazione | { errore?: string } | null;
    if (!corpo) return { ok: false, errore: `Il Customer Service risponde ${res.status} senza corpo.` };
    if ("ok" in corpo) return corpo;
    return { ok: false, errore: corpo.errore ?? `Il Customer Service risponde ${res.status}.` };
  } catch {
    return {
      ok: false,
      errore:
        "Il Customer Service non ha risposto in tempo. ⚠️ La bozza POTREBBE essere stata creata lo stesso: prima di riprovare, controlla le bozze su Shopify per non fare un ordine doppio.",
    };
  }
}

// Il Customer Service risponde con la chiave giusta? Per la pagina Impostazioni.
export async function statoCS(): Promise<{ raggiungibile: boolean; autenticato: boolean }> {
  const k = await chiave();
  try {
    const res = await fetch(`${await base()}/api/v1/nuovo-ordine/negozi`, {
      headers: k ? { "x-api-key": k } : {},
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    // Anche un 401 dimostra che l'app c'è.
    return { raggiungibile: true, autenticato: Boolean(k) && res.ok };
  } catch {
    return { raggiungibile: false, autenticato: false };
  }
}

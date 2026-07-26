import { prisma } from "./db";

// Ponte verso l'app Ricerca fornitori (search-deluxy): dato un ordine, torna i
// fornitori più vicini all'indirizzo di consegna, con contatti e distanza.
//
// Orders resta il registro degli ordini; la ricerca dei fornitori è un servizio
// esterno che si interroga quando serve — non se ne duplicano i dati.
//
// Configurazione (mai nel codice):
//   SEARCH_API_KEY  chiave dell'app Ricerca fornitori (dlxs_…)
//   SEARCH_URL      opzionale, default https://search-deluxy.vercel.app

const BASE = (process.env.SEARCH_URL || "https://search-deluxy.vercel.app").replace(/\/$/, "");

export type Fornitore = {
  nome: string;
  indirizzo: string;
  telefono: string;
  whatsapp: string | null;
  whatsappProbabile: boolean | null;
  sito: string | null;
  mappa: string | null;
  apertoOra: boolean | null;
  valutazione: number | null;
  numeroRecensioni: number | null;
  distanzaKm?: number | null;
  minutiAuto?: number | null;
  distanzaTipo?: string;
};

export type EsitoFornitori =
  | { stato: "ok"; categoria: string; consegna: { indirizzo: string } | null; fornitori: Fornitore[]; nota?: string }
  | { stato: "non-configurato" }
  | { stato: "errore"; messaggio: string };

// Il nome del brand come lo conosce l'app Ricerca fornitori.
export async function brandPerRicerca(brand: string): Promise<string> {
  const negozio = await prisma.negozioShopify.findUnique({
    where: { brand },
    select: { brandRicerca: true },
  });
  return negozio?.brandRicerca?.trim() || brand;
}

// Il numero d'ordine senza il cancelletto: l'API lo vuole nudo (es. 1725).
export function numeroNudo(numero: string): string {
  return numero.replace(/^#/, "").trim();
}

// Link diretto all'app Ricerca fornitori con l'ordine già impostato.
// È il "bottone rapido" sotto ogni ordine: non serve nessuna chiave, apre
// l'altra app pronta a cercare. `brandRicerca` è il nome del brand lì (per i
// negozi il cui nome qui è diverso, es. Flowers → deluxyflowers.com).
export function linkRicerca(brandRicerca: string, numero: string): string {
  const p = new URLSearchParams({ brand: brandRicerca, ordine: numeroNudo(numero) });
  return `${BASE}/?${p}`;
}

export function ricercaConfigurata(): boolean {
  return Boolean(process.env.SEARCH_API_KEY);
}

// Interroga l'app Ricerca fornitori per un ordine.
export async function cercaFornitori(
  brand: string,
  numero: string,
  categoria?: string,
): Promise<EsitoFornitori> {
  const chiave = process.env.SEARCH_API_KEY;
  if (!chiave) return { stato: "non-configurato" };

  const p = new URLSearchParams({ brand: await brandPerRicerca(brand), number: numeroNudo(numero) });
  if (categoria) p.set("categoria", categoria);

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/fornitori?${p}`, {
      headers: { "x-api-key": chiave },
      // la ricerca fa geocodifica + Places + distanze: può prendersi qualche secondo
      signal: AbortSignal.timeout(25000),
      cache: "no-store",
    });
  } catch (e) {
    const err = e as Error;
    return {
      stato: "errore",
      messaggio:
        err.name === "TimeoutError"
          ? "L'app Ricerca fornitori non ha risposto in tempo."
          : `Non raggiungibile: ${err.message}`,
    };
  }

  const corpo = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    categoria?: string;
    consegna?: { indirizzo: string };
    fornitori?: Fornitore[];
    nota?: string;
  };

  if (!res.ok) {
    // messaggi utili invece del codice HTTP nudo
    if (res.status === 401 || res.status === 403) {
      return { stato: "errore", messaggio: "Chiave SEARCH_API_KEY non valida o scaduta." };
    }
    return { stato: "errore", messaggio: corpo.error || `L'app Ricerca fornitori ha risposto ${res.status}.` };
  }

  return {
    stato: "ok",
    categoria: corpo.categoria ?? "",
    consegna: corpo.consegna ?? null,
    fornitori: corpo.fornitori ?? [],
    nota: corpo.nota,
  };
}

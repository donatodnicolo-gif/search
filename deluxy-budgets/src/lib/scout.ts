// Client dell'app Scout: Scout è il MASTER delle linee di vendita (linee di
// interesse, con sottolinee). Budgets le legge da qui invece di tenerne una
// copia. Sorgente: Edge Function Supabase `linee` (header x-api-key). La chiave
// LINEE_API_KEY arriva dalla cassaforte del Hub (o dall'env locale in dev).
import { chiave } from "./chiavi";

const URL_LINEE =
  process.env.SCOUT_LINEE_URL ?? "https://fdsziebgkljfsugqqbqd.supabase.co/functions/v1/linee";

export type Sottolinea = {
  id: string;
  nome: string;
  icona: string | null;
  attiva: boolean;
  ordine: number;
  pitch: string | null;
};
export type LineaScout = Sottolinea & { sottolinee: Sottolinea[] };

export type LineeResult =
  | { ok: true; linee: LineaScout[]; aggiornato: string | null }
  | { ok: false; errore: string; configurato: boolean };

export async function fetchLineeScout(opts: { soloAttive?: boolean } = {}): Promise<LineeResult> {
  const key = await chiave("LINEE_API_KEY");
  if (!key) {
    return {
      ok: false,
      configurato: false,
      errore: "Chiave Scout (LINEE_API_KEY) non trovata nel Hub né in locale.",
    };
  }
  const qs = opts.soloAttive ? "?soloAttive=1" : "";
  try {
    const res = await fetch(`${URL_LINEE}${qs}`, {
      headers: { "x-api-key": key },
      cache: "no-store",
    });
    if (res.status === 401) {
      return { ok: false, configurato: true, errore: "Chiave Scout non valida (401)." };
    }
    if (!res.ok) return { ok: false, configurato: true, errore: `Scout ha risposto ${res.status}.` };
    const dati = (await res.json()) as { linee?: LineaScout[]; aggiornato?: string };
    if (!Array.isArray(dati?.linee)) {
      return { ok: false, configurato: true, errore: "Risposta di Scout non riconosciuta." };
    }
    return { ok: true, linee: dati.linee, aggiornato: dati.aggiornato ?? null };
  } catch {
    return { ok: false, configurato: true, errore: "Scout non raggiungibile: riprova più tardi." };
  }
}

// Nome normalizzato per agganciare le linee di Scout ai target di budget
// (che vengono da una fonte diversa): minuscole, senza accenti né doppi spazi.
export function normalizzaNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

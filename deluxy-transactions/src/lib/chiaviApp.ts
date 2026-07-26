// Le chiavi con cui questa app parla con le altre (oggi: nessuna in uscita, ma
// il pattern resta quello obbligatorio dello Standard Deluxy §4.2, così quando
// servirà — es. leggere le anagrafiche per riconoscere un beneficiario — non si
// improvvisa).
//
// Sorgenti, in ordine: cassaforte del Hub → variabile d'ambiente.
// Regole: non fallire mai, cache 5 minuti, timeout 4 secondi, riuso
// dell'ultima risposta buona.

const PROGETTO_HUB = "deluxy-transactions";
const TTL = 5 * 60 * 1000;

let cache: { at: number; chiavi: Record<string, string> } | null = null;

async function dalHub(): Promise<Record<string, string>> {
  const token = (process.env.HUB_KEYS_TOKEN ?? "").trim();
  if (token.length < 16) return {};
  if (cache && Date.now() - cache.at < TTL) return cache.chiavi;
  const base = (process.env.HUB_URL || "https://deluxy-hub.vercel.app").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/chiavi?progetto=${encodeURIComponent(PROGETTO_HUB)}`, {
      headers: { "x-api-key": token },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return cache?.chiavi ?? {};
    const dati = (await res.json()) as { chiavi?: Record<string, string> };
    cache = { at: Date.now(), chiavi: dati.chiavi ?? {} };
    return cache.chiavi;
  } catch {
    return cache?.chiavi ?? {};
  }
}

/** Valore di una chiave: prima la cassaforte del Hub, poi l'ambiente. */
export async function chiave(nome: string): Promise<string> {
  const hub = await dalHub();
  return (hub[nome] ?? process.env[nome] ?? "").trim();
}

export function svuotaCacheChiavi(): void {
  cache = null;
}

// Client della cassaforte del Hub: le chiavi (Finance, OpenAI, …) si chiedono al
// Hub a runtime invece di tenerle nel .env di questa app. L'unico segreto locale
// è il token di servizio HUB_KEYS_TOKEN (più HUB_URL). In sviluppo, una chiave
// presente nel .env locale ha la precedenza, così si può lavorare offline.
//
// Fonte di verità: la pagina /chiavi del Hub (progetto "deluxy-budgets").

const PROGETTO = "deluxy-budgets";
const HUB_URL = (process.env.HUB_URL || "https://deluxy-hub.vercel.app").replace(/\/$/, "");

// Cache in memoria per istanza server: si evita una fetch al Hub a ogni accesso.
// Le chiavi possono ruotare: TTL breve così un cambio si propaga da solo.
let cache: { valori: Record<string, string>; scadenza: number } | null = null;
const TTL_MS = 5 * 60_000;

async function chiaviDalHub(): Promise<Record<string, string>> {
  const token = (process.env.HUB_KEYS_TOKEN || "").trim();
  if (!token) return {}; // vault non configurato: si resta sull'env locale
  if (cache && cache.scadenza > Date.now()) return cache.valori;

  try {
    const res = await fetch(`${HUB_URL}/api/chiavi?progetto=${encodeURIComponent(PROGETTO)}`, {
      headers: { "X-Hub-Token": token },
      cache: "no-store",
    });
    if (!res.ok) return cache?.valori ?? {};
    const dati = (await res.json()) as { chiavi?: Record<string, string> };
    const valori = dati?.chiavi ?? {};
    cache = { valori, scadenza: Date.now() + TTL_MS };
    return valori;
  } catch {
    return cache?.valori ?? {}; // Hub irraggiungibile: si usa l'ultima copia nota
  }
}

// Valore di una chiave: prima l'env locale (override di sviluppo), poi il Hub.
export async function chiave(nome: string): Promise<string | null> {
  const locale = (process.env[nome] || "").trim();
  if (locale) return locale;
  const dalHub = (await chiaviDalHub())[nome];
  return dalHub ? dalHub.trim() : null;
}

// Se le chiavi sono raggiungibili (via env o via Hub configurato).
export function vaultConfigurato(): boolean {
  return Boolean((process.env.HUB_KEYS_TOKEN || "").trim());
}

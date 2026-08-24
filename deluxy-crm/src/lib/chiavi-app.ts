// Le chiavi delle altre app, lette col pattern standard Deluxy (§4.2):
// cassaforte del Hub (HUB_URL + HUB_KEYS_TOKEN, progetto "deluxy-crm") con
// cache di 5 minuti e timeout di 4 secondi, poi le variabili d'ambiente come
// fallback. Non fallisce mai: se il Hub è giù si usa l'ultima risposta buona,
// o l'env.

const HUB_URL = (process.env.HUB_URL ?? "https://deluxy-hub.vercel.app").replace(/\/$/, "");
const PROGETTO = "deluxy-crm";
const TTL_MS = 5 * 60 * 1000;

// Il BOM che Windows infila nei .env: una chiave con BOM è "sbagliata" senza
// esserlo (trappola già pagata da Anagrafiche sul consumo di Orders).
function pulita(valore: string): string {
  const senzaBom = valore.charCodeAt(0) === 0xfeff ? valore.slice(1) : valore;
  return senzaBom.trim();
}

let cache: { valori: Record<string, string>; scade: number } | null = null;
let ultimaBuona: Record<string, string> = {};

async function dallaCassaforte(): Promise<Record<string, string>> {
  const token = process.env.HUB_KEYS_TOKEN ? pulita(process.env.HUB_KEYS_TOKEN) : null;
  if (!token) return {};
  if (cache && cache.scade > Date.now()) return cache.valori;

  try {
    const res = await fetch(`${HUB_URL}/api/chiavi?progetto=${PROGETTO}`, {
      headers: { "x-api-key": token },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Hub ${res.status}`);
    const dati = (await res.json()) as { chiavi?: Record<string, string> };
    const valori = dati.chiavi ?? {};
    cache = { valori, scade: Date.now() + TTL_MS };
    ultimaBuona = valori;
    return valori;
  } catch {
    // Hub irraggiungibile: si riusa l'ultima risposta buona (anche scaduta).
    return ultimaBuona;
  }
}

// Il valore di una chiave: cassaforte del Hub, poi env.
export async function chiaveApp(nome: string): Promise<string | null> {
  const cassaforte = await dallaCassaforte();
  const valore = cassaforte[nome] ?? process.env[nome];
  return valore ? pulita(valore) : null;
}

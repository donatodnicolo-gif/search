// Le chiavi delle altre app, lette col pattern standard Deluxy (§4.2):
// cassaforte del Hub (HUB_URL + HUB_KEYS_TOKEN, progetto "deluxy-crm") con
// cache di 5 minuti e timeout di 4 secondi, poi le variabili d'ambiente come
// fallback. Non fallisce mai: se il Hub è giù si usa l'ultima risposta buona,
// o l'env.
//
// ⚠️⚠️ MISURA DELL'11/09/2026 — il Hub può essere LENTO. Appena il CRM ha avuto
// un `HUB_KEYS_TOKEN` (prima non ce l'aveva e la chiamata non partiva),
// `GET /api/chiavi` del Hub ha cominciato a metterci **20 s** misurati, cioè
// oltre il timeout: ogni pagina pagava 4 s buttati, e le pagine che chiedono
// due chiavi insieme ne pagavano 8 (ogni chiamata partiva per conto suo,
// perché la cache si scrive solo DOPO la risposta). Due difese, qui sotto:
//
//   1. UNA SOLA CHIAMATA IN VOLO: chi arriva mentre l'altra sta rispondendo
//      aspetta quella, non ne apre un'altra.
//   2. SI RICORDA ANCHE IL BUCO: se il Hub non risponde, per 60 secondi non si
//      riprova — si usa l'env. Senza, ogni pagina ripaga il timeout intero.
//
// La lentezza del Hub è cosa sua ed è registrata in SEGNALAZIONI-PERFORMANCE:
// qui si rende innocua, non si nasconde.

const HUB_URL = (process.env.HUB_URL ?? "https://deluxy-hub.vercel.app").replace(/\/$/, "");
const PROGETTO = "deluxy-crm";
const TTL_MS = 5 * 60 * 1000;
/** Quanto si sta zitti dopo un buco: riprovare a ogni pagina costa il timeout. */
const TTL_BUCO_MS = 60 * 1000;

// Il BOM che Windows infila nei .env: una chiave con BOM è "sbagliata" senza
// esserlo (trappola già pagata da Anagrafiche sul consumo di Orders).
function pulita(valore: string): string {
  const senzaBom = valore.charCodeAt(0) === 0xfeff ? valore.slice(1) : valore;
  return senzaBom.trim();
}

let cache: { valori: Record<string, string>; scade: number } | null = null;
let ultimaBuona: Record<string, string> = {};
/** La chiamata in corso, se c'è: la condividono tutti quelli che arrivano dopo. */
let inVolo: Promise<Record<string, string>> | null = null;

async function chiedialHub(token: string): Promise<Record<string, string>> {
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
    // Hub irraggiungibile o lento: si riusa l'ultima risposta buona (anche
    // scaduta) e si segna il buco, così non si ripaga il timeout a ogni pagina.
    cache = { valori: ultimaBuona, scade: Date.now() + TTL_BUCO_MS };
    return ultimaBuona;
  } finally {
    inVolo = null;
  }
}

async function dallaCassaforte(): Promise<Record<string, string>> {
  const token = process.env.HUB_KEYS_TOKEN ? pulita(process.env.HUB_KEYS_TOKEN) : null;
  if (!token) return {};
  if (cache && cache.scade > Date.now()) return cache.valori;
  // Una sola chiamata in volo: le altre si mettono in coda su quella.
  if (!inVolo) inVolo = chiedialHub(token);
  return inVolo;
}

// Il valore di una chiave: cassaforte del Hub, poi env.
export async function chiaveApp(nome: string): Promise<string | null> {
  const cassaforte = await dallaCassaforte();
  const valore = cassaforte[nome] ?? process.env[nome];
  return valore ? pulita(valore) : null;
}

// Client della cassaforte del Hub: le chiavi (Finance, OpenAI, …) si chiedono al
// Hub a runtime invece di tenerle nel .env di questa app. L'unico segreto locale
// è il token di servizio HUB_KEYS_TOKEN (più HUB_URL). In sviluppo, una chiave
// presente nel .env locale ha la precedenza, così si può lavorare offline.
//
// Fonte di verità: la pagina /chiavi del Hub (progetto "deluxy-budgets").

import { prisma } from "./db";
import { anteprima, cifraturaConfigurata, decifra } from "./crypto";

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
      // Il hub accetta SOLO x-api-key (o Authorization: Bearer): con un altro
      // nome risponde 401 e la cassaforte non si legge mai. Standard §4.1.
      headers: { "x-api-key": token },
      cache: "no-store",
      // Il hub non deve mai far aspettare una pagina: se tarda si usa il resto.
      signal: AbortSignal.timeout(4000),
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

// Valore di una chiave, in ordine di precedenza:
//  1. variabile d'ambiente — override di sviluppo e via più rapida in produzione;
//  2. chiave impostata **dentro l'app** (Configurazione → Chiavi), cifrata a DB;
//  3. cassaforte del Hub.
// L'ordine non è casuale: l'ambiente vince perché è quello che si cambia in
// emergenza senza entrare nell'app, e il Hub sta in fondo perché è la fonte
// condivisa, quella che non si tocca per un caso singolo.
export async function chiave(nome: string): Promise<string | null> {
  const locale = (process.env[nome] || "").trim();
  if (locale) return locale;

  const salvata = await chiaveDalDatabase(nome);
  if (salvata) return salvata;

  const dalHub = (await chiaviDalHub())[nome];
  return dalHub ? dalHub.trim() : null;
}

// Le chiavi scritte in Configurazione. Se APP_SECRET non c'è (o è cambiata) il
// valore non si può decifrare: si tratta come «non impostata» invece di far
// esplodere la pagina che la stava chiedendo.
async function chiaveDalDatabase(nome: string): Promise<string | null> {
  if (!cifraturaConfigurata()) return null;
  try {
    const riga = await prisma.chiaveApi.findUnique({ where: { nome } });
    if (!riga) return null;
    return decifra(riga.cifrato).trim() || null;
  } catch {
    return null;
  }
}

// Le chiavi che questa app usa davvero, con cosa smettono di funzionare se
// mancano. È l'elenco che si vede in Configurazione: uno spazio per incollare
// una chiave qualsiasi inviterebbe a metterci roba che nessuno legge.
export const CHIAVI_NOTE = [
  {
    nome: "OPENAI_API_KEY",
    label: "OpenAI (ChatGPT)",
    serve: "Le proposte AI nel CFO: categorie e classificazione delle controparti di banca.",
  },
  {
    nome: "FINANCE_API_KEY",
    label: "Finance (deluxy-partner)",
    serve: "Fatturato per tipologia e uscite di banca: senza, Consuntivo e CFO restano vuoti.",
  },
  {
    nome: "ORDERS_API_KEY",
    label: "Orders (registro ordini)",
    serve: "Il venduto dei negozi Shopify: senza, la sezione Venduto e la riga ecommerce spariscono.",
  },
  {
    // Unica chiave in ENTRATA: le altre servono a questa app per chiamare
    // fuori, questa serve a farsi chiamare. Sta nella stessa pagina perché per
    // chi la imposta è comunque «la chiave da mettere per far funzionare quella
    // cosa», e cercarla altrove sarebbe solo un modo per non trovarla.
    nome: "BUDGETS_API_KEY",
    label: "Chiave in ENTRATA (le altre app leggono da qui)",
    serve:
      "Con questa le altre app Deluxy leggono le CATEGORIE DI COSTO da GET /api/v1/categorie. Oggi la usa Finance per categorizzare le uscite di banca: senza, lì l'elenco resta vuoto.",
  },
] as const;

// Da dove arriva ogni chiave, per mostrarlo in Configurazione senza mai
// rivelarne il valore. L'ordine rispecchia quello di chiave().
export async function origineChiavi(): Promise<
  { nome: string; origine: "ambiente" | "app" | "hub" | "assente"; anteprima: string | null }[]
> {
  const dalHub = await chiaviDalHub();
  const salvate = cifraturaConfigurata()
    ? await prisma.chiaveApi.findMany({ select: { nome: true, cifrato: true } }).catch(() => [])
    : [];
  return CHIAVI_NOTE.map((c) => {
    const env = (process.env[c.nome] || "").trim();
    if (env) return { nome: c.nome, origine: "ambiente" as const, anteprima: anteprima(env) };
    const salvata = salvate.find((s) => s.nome === c.nome);
    if (salvata) {
      try {
        return { nome: c.nome, origine: "app" as const, anteprima: anteprima(decifra(salvata.cifrato)) };
      } catch {
        // Cifrata con un'altra APP_SECRET: c'è ma non si può leggere.
        return { nome: c.nome, origine: "assente" as const, anteprima: null };
      }
    }
    if (dalHub[c.nome]) return { nome: c.nome, origine: "hub" as const, anteprima: anteprima(dalHub[c.nome]) };
    return { nome: c.nome, origine: "assente" as const, anteprima: null };
  });
}

// Se le chiavi sono raggiungibili (via env o via Hub configurato).
export function vaultConfigurato(): boolean {
  return Boolean((process.env.HUB_KEYS_TOKEN || "").trim());
}

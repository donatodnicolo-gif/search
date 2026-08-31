// Client dell'API Orders (deluxy-orders): il venduto reale dei negozi Shopify,
// che è il consuntivo del canale D2C.
//
// Perché serve: il D2C non passa da Finance. Le fatture di Finance coprono il
// B2B e gli Eventi; le vendite ai consumatori nascono e muoiono su Shopify, e
// il registro che le tiene tutte è Orders. Senza questa chiamata la riga D2C
// del consuntivo resterebbe a "—" pur avendo il budget più grande dell'anno.
//
// La chiave è un SEGRETO: vive nel .env locale (ORDERS_API_KEY) o nella
// cassaforte del Hub, mai committata.

import { RIVALIDA } from "./cache";
import { chiave } from "./chiavi";
import { normalizzaNome } from "./scout";

const BASE = process.env.ORDERS_URL ?? "https://deluxy-orders.vercel.app";

export type RicaviBrand = {
  brand: string;
  ordini: number;
  lordo: number;
  mesi: number[]; // 12 valori, IVA e spedizione incluse
  ordiniMese: number[];
  // L'economia della vendita che la piattaforma scrive sugli ordini (26/08):
  // fee incassate dai partner come commissioni (lorde) e primo margine
  // ((pagato − valore prodotti) ÷ 1,22, quindi netto IVA). Somme sui SOLI
  // ordini che hanno il dato: la copertura viaggia accanto, e zero ordini col
  // dato è «n.d.», non zero. Opzionali perché l'Orders in produzione potrebbe
  // essere una versione senza questi campi.
  fee?: number;
  primoMargine?: number;
  ordiniConEconomia?: number;
  lordoConEconomia?: number;
  feeMese?: number[];
  primoMargineMese?: number[];
  conEconomiaMese?: number[];
  lordoConEconomiaMese?: number[];
  // Gli altri due ingredienti del margine (26/08 sera): il costo della
  // consegna (copia della piattaforma, che resta la padrona del numero) e la
  // COMMISSIONE D INCASSO (Stripe/Shopify: trattenuta prima del bonifico,
  // quindi in banca non esiste).
  costoConsegnaMese?: number[];
  commissioneIncassiMese?: number[];
};

/**
 * Le COMMISSIONI D INCASSO del periodo, per mese (31/08/2026, decisione
 * dell utente: vanno nel Costo per servizi). Stripe e Shopify le trattengono
 * PRIMA del bonifico: in banca non esistono (misurato: 19.170 € sull anno
 * contro 3.074 € di soli abbonamenti in banca), quindi senza questa somma il
 * conto economico non le vede da nessuna parte. Null = Orders non risponde o
 * non porta il campo: il chiamante lo dichiara, non mette zero.
 */
export function commissioniIncassiMese(res: RicaviResult): number[] | null {
  if (!res.ok) return null;
  if (!res.dati.brand.some((b) => Array.isArray(b.commissioneIncassiMese))) return null;
  const mesi = Array(12).fill(0) as number[];
  for (const b of res.dati.brand)
    for (let i = 0; i < 12; i++) mesi[i] += b.commissioneIncassiMese?.[i] ?? 0;
  return mesi;
}

export type Ricavi = {
  anno: number;
  periodo: { da: string; a: string; fuso: string };
  criteri: { annullatiInclusi: boolean; rimborsatiInclusi: boolean; importo: string };
  brand: RicaviBrand[];
  totali: { ordini: number; lordo: number; mesi: number[] };
  esclusi: {
    annullati: { ordini: number; lordo: number };
    rimborsati: { ordini: number; lordo: number };
    parzialmenteRimborsati: { ordini: number; lordo: number; contati: boolean };
  };
};

export type RicaviResult =
  | { ok: true; dati: Ricavi }
  | { ok: false; errore: string; configurato: boolean };

// `fino` (data ISO esclusiva) serve al confronto con l'anno prima quando il mese
// corrente è ancora in corso: fermare anche l'anno scorso allo stesso giorno è
// l'unico modo per non confrontare 26 giorni di luglio con 31. Orders accetta
// un intervallo di date, quindi qui il paragone è esatto — a differenza di
// Finance e della banca, che hanno solo il mese.
export async function fetchRicaviD2C(anno: number, fino?: string): Promise<RicaviResult> {
  const key = await chiave("ORDERS_API_KEY");
  if (!key) {
    return {
      ok: false,
      configurato: false,
      errore:
        "Chiave Orders non configurata. Imposta ORDERS_API_KEY nel .env (o nella cassaforte del Hub, progetto deluxy-budgets).",
    };
  }
  try {
    const qs = new URLSearchParams({ anno: String(anno) });
    if (fino) {
      qs.set("da", `${anno}-01-01`);
      qs.set("a", fino);
    }
    const res = await fetch(`${BASE}/api/v1/ricavi?${qs.toString()}`, {
      headers: { "x-api-key": key, "X-App": "deluxy-budgets" },
      next: { revalidate: RIVALIDA },
    });
    if (res.status === 401) {
      return { ok: false, configurato: true, errore: "Chiave Orders non valida (401): controlla ORDERS_API_KEY." };
    }
    if (res.status === 404) {
      return {
        ok: false,
        configurato: true,
        errore: "Endpoint /api/v1/ricavi non ancora disponibile su Orders: va deployata la nuova versione.",
      };
    }
    if (!res.ok) return { ok: false, configurato: true, errore: `Orders ha risposto ${res.status}.` };
    const dati = (await res.json()) as Ricavi;
    if (!Array.isArray(dati?.brand)) {
      return { ok: false, configurato: true, errore: "Risposta di Orders non riconosciuta." };
    }
    return { ok: true, dati };
  } catch {
    return { ok: false, configurato: true, errore: "Orders non raggiungibile: riprova più tardi." };
  }
}

// Le vendite di un **intervallo di date** qualsiasi (per la vista «questa
// settimana» di /aggiornato, 30/08/2026). Orders accetta `da`/`a` (esclusiva),
// quindi la settimana è esatta al giorno — a differenza di banca e Finance,
// che hanno solo il mese: è il motivo per cui la vista settimanale mostra SOLO
// le vendite, e lo dichiara.
export async function fetchRicaviIntervallo(da: string, a: string): Promise<RicaviResult> {
  const key = await chiave("ORDERS_API_KEY");
  if (!key) {
    return { ok: false, configurato: false, errore: "Chiave Orders non configurata (ORDERS_API_KEY)." };
  }
  try {
    const qs = new URLSearchParams({ anno: da.slice(0, 4), da, a });
    const res = await fetch(`${BASE}/api/v1/ricavi?${qs.toString()}`, {
      headers: { "x-api-key": key, "X-App": "deluxy-budgets" },
      next: { revalidate: RIVALIDA },
    });
    if (!res.ok) return { ok: false, configurato: true, errore: `Orders ha risposto ${res.status}.` };
    const dati = (await res.json()) as Ricavi;
    if (!Array.isArray(dati?.brand)) {
      return { ok: false, configurato: true, errore: "Risposta di Orders non riconosciuta." };
    }
    return { ok: true, dati };
  } catch {
    return { ok: false, configurato: true, errore: "Orders non raggiungibile: riprova più tardi." };
  }
}

// ---- L'IVA non si scorpora ----
// Il totale Shopify è IVA inclusa e **si usa così com'è**: il budget D2C di
// Deluxy è scritto sulla stessa base. Una prima versione lo scorporava (22% di
// default, scelto in pagina) perché il fatturato di Finance è imponibile: il
// risultato era un consuntivo ecommerce più basso di un quinto e un canale che
// sembrava molto più indietro di quanto fosse. Le due fonti restano su basi
// diverse — Finance imponibile, Shopify IVA inclusa — e la pagina lo dichiara,
// invece di uniformarle con un'aliquota inventata (Shopify non salva l'aliquota
// sull'ordine, quindi «uniformare» vorrebbe dire indovinare).

// Abbina un brand di Orders a una maison del budget: prima per nome
// ("deluxy.it" = maison "Deluxy.it"), poi per slug ("Flowers" = maison
// "flowers"). Chi non trova casa NON viene sommato di nascosto: la pagina lo
// elenca a parte, come già fa il consuntivo con le tipologie di Finance.
export function abbinaMaison(
  brand: string,
  maisons: { slug: string; nome: string }[]
): string | null {
  const b = normalizzaNome(brand);
  const perNome = maisons.find((m) => normalizzaNome(m.nome) === b);
  if (perNome) return perNome.slug;
  const perSlug = maisons.find((m) => normalizzaNome(m.slug) === b);
  return perSlug ? perSlug.slug : null;
}

// ---- La quota del fornitore, cioè il margine del D2C ----
//
// **La regola economica vive in Orders e si legge da lì** (contratto dati,
// Standard Deluxy §7: quota, margine e fee non si ricopiano — le tiene chi le
// possiede). Orders risponde con la quota che va al fornitore (60%): il margine
// che resta a Deluxy è il complemento.
//
// È la fine della quota **misurata dalla banca** per questo scopo: quel conto
// divideva TUTTI i pagamenti ai fioristi per il SOLO venduto dei negozi, quindi
// ci finivano dentro anche i fioristi degli eventi e del B2B — e la quota
// peggiorava ogni volta che si classificava meglio la banca, che è il contrario
// di come si comporta una misura.
export async function fetchQuotaFornitore(): Promise<
  { ok: true; quotaFornitore: number; dove: string } | { ok: false; errore: string }
> {
  const key = await chiave("ORDERS_API_KEY");
  if (!key) return { ok: false, errore: "ORDERS_API_KEY non configurata." };
  try {
    const res = await fetch(`${BASE}/api/v1/quota-fornitore`, {
      headers: { "X-API-Key": key, "X-App": "deluxy-budgets" },
      next: { revalidate: RIVALIDA },
    });
    if (!res.ok) return { ok: false, errore: `Orders ha risposto ${res.status}.` };
    const dati = (await res.json()) as { quota?: number; dove?: string };
    const q = Number(dati?.quota);
    // Una quota fuori da 0–100 non è una quota: meglio il ripiego dichiarato
    // che un margine negativo scritto nel conto economico.
    if (!Number.isFinite(q) || q <= 0 || q >= 100) {
      return { ok: false, errore: "Orders ha risposto con una quota fuori scala." };
    }
    return { ok: true, quotaFornitore: q, dove: dati?.dove ?? "Deluxy Orders" };
  } catch {
    return { ok: false, errore: "Orders non raggiungibile." };
  }
}

// ---- Il margine per brand, misurato sugli ordini riconciliati ----
export type MargineBrand = {
  brand: string;
  ordini: number;
  lordo: number;
  ordiniMisurati: number;
  lordoMisurato: number;
  // `null` = nessun ordine riconciliato per questo brand: non si sa, non è zero.
  margineMisurato: number | null;
  coperturaPct: number;
};

export type MarginiResult =
  | { ok: true; brand: MargineBrand[]; regola: { quotaFornitore: number; margine: number; dove: string } }
  | { ok: false; errore: string };

// I margini che Orders misura sugli ordini con il costo del fornitore scritto
// (riconciliazione banca / Customer Service). La copertura arriva con il dato:
// un margine su 60 ordini di 800 è un'indicazione, non un censimento, e chi lo
// usa deve poterlo dire.
export async function fetchMarginiBrand(anno: number): Promise<MarginiResult> {
  const key = await chiave("ORDERS_API_KEY");
  if (!key) return { ok: false, errore: "ORDERS_API_KEY non configurata." };
  try {
    const res = await fetch(`${BASE}/api/v1/margini?anno=${anno}`, {
      headers: { "X-API-Key": key, "X-App": "deluxy-budgets" },
      next: { revalidate: RIVALIDA },
    });
    if (!res.ok) return { ok: false, errore: `Orders ha risposto ${res.status}.` };
    const dati = (await res.json()) as {
      brand?: MargineBrand[];
      regola?: { quotaFornitore: number; margine: number; dove: string };
    };
    if (!Array.isArray(dati?.brand) || !dati.regola) {
      return { ok: false, errore: "Risposta di Orders non riconosciuta." };
    }
    return { ok: true, brand: dati.brand, regola: dati.regola };
  } catch {
    return { ok: false, errore: "Orders non raggiungibile." };
  }
}

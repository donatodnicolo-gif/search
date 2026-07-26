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

import { chiave } from "./chiavi";
import { normalizzaNome } from "./scout";

const BASE = process.env.ORDERS_URL ?? "https://deluxy-orders.vercel.app";

export type RicaviBrand = {
  brand: string;
  ordini: number;
  lordo: number;
  mesi: number[]; // 12 valori, IVA e spedizione incluse
  ordiniMese: number[];
};

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
      cache: "no-store",
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

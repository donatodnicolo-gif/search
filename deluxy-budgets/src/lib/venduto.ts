// **Venduto ≠ fatturato.** Sui negozi Shopify il cliente paga il prezzo pieno,
// ma una parte di quel denaro non è di Deluxy: va al partner che esegue
// l'ordine (fiorai, pasticcerie). Il *venduto* è quanto è passato dalla cassa
// del negozio; il *fatturato* è quello che resta a Deluxy dopo le detrazioni
// dei partner.
//
// Tenerli separati è il punto: sommare il venduto nel conto economico
// gonfierebbe i ricavi di più del doppio, e il margine che ne uscirebbe non
// esiste.

import { abbinaMaison, fetchRicaviD2C, type RicaviResult } from "./orders";

// Quota del venduto che diventa fatturato Deluxy. **È una stima**, decisa con
// l'utente il 26/07/2026 in attesa del dato vero: le detrazioni dei partner non
// sono ancora in nessuna app, quindi finché non arrivano si applica una
// percentuale unica. Si cambia qui, ed è scritta in chiaro in ogni schermata
// che la usa — un numero inventato che non si vede è peggio di uno sbagliato.
export const QUOTA_FATTURATO = 40;

export function fatturatoDaVenduto(venduto: number): number {
  return venduto * (QUOTA_FATTURATO / 100);
}

export type Venduto = {
  ok: boolean;
  errore: string;
  configurato: boolean;
  // 12 valori, indice 0 = gennaio
  mese: number[];
  perMaison: Map<string, number[]>;
  // Negozi che non corrispondono a nessuna maison del budget: entrano comunque
  // nei totali e si elencano a parte, così il conto torna e nessun venduto
  // sparisce in silenzio.
  senzaMaison: { brand: string; mesi: number[] }[];
  ordini: number;
  negozi: number;
  esclusi: RicaviEsclusi | null;
};

type RicaviEsclusi = {
  annullati: { ordini: number; lordo: number };
  rimborsati: { ordini: number; lordo: number };
  parzialmenteRimborsati: { ordini: number; lordo: number; contati: boolean };
};

const VUOTO: Venduto = {
  ok: false,
  errore: "",
  configurato: true,
  mese: Array(12).fill(0),
  perMaison: new Map(),
  senzaMaison: [],
  ordini: 0,
  negozi: 0,
  esclusi: null,
};

// Raggruppa la risposta di Orders per maison del budget. `maisons` serve solo
// per l'abbinamento: chi non trova casa resta visibile.
export function raggruppa(res: RicaviResult, maisons: { slug: string; nome: string }[]): Venduto {
  if (!res.ok) return { ...VUOTO, errore: res.errore, configurato: res.configurato, perMaison: new Map(), senzaMaison: [] };

  const mese = Array(12).fill(0) as number[];
  const perMaison = new Map<string, number[]>();
  const senzaMaison: { brand: string; mesi: number[] }[] = [];
  for (const b of res.dati.brand) {
    const mesi = b.mesi;
    for (let i = 0; i < 12; i++) mese[i] += mesi[i] ?? 0;
    const slug = abbinaMaison(b.brand, maisons);
    if (!slug) {
      senzaMaison.push({ brand: b.brand, mesi });
      continue;
    }
    const gia = perMaison.get(slug);
    if (gia) for (let i = 0; i < 12; i++) gia[i] += mesi[i] ?? 0;
    else perMaison.set(slug, [...mesi]);
  }

  return {
    ok: true,
    errore: "",
    configurato: true,
    mese,
    perMaison,
    senzaMaison,
    ordini: res.dati.totali.ordini,
    negozi: res.dati.brand.length,
    esclusi: res.dati.esclusi,
  };
}

export async function caricaVenduto(
  anno: number,
  maisons: { slug: string; nome: string }[],
  fino?: string
): Promise<Venduto> {
  return raggruppa(await fetchRicaviD2C(anno, fino), maisons);
}

// Somma dei mesi indicati (1..12).
export function sommaMesi(mesi: number[] | undefined, quali: number[]): number {
  if (!mesi) return 0;
  return quali.reduce((s, m) => s + (mesi[m - 1] ?? 0), 0);
}

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

// ---- Modello C: sull'ecommerce Deluxy è un intermediario ----
//
// Le quattro domande che decidono se sei venditore o intermediario, risposte
// dall'utente il 28/07/2026: sull'**ecommerce** la vendita al cliente la
// documenta il **partner** (scontrino), il rischio del reso è scaricato su di
// lui, e a Deluxy resta una quota — quindi *ricavo = la quota*, e il denaro che
// gira al partner è una **partita di giro**, non un costo. Su **eventi e B2B** è
// il contrario: la fattura la emette Deluxy, il fornitore fattura a Deluxy, e
// quel pagamento è un costo pieno.
//
// La quota di Deluxy non si stima più: si **misura**, anno per anno, come
// `1 − (pagato ai partner ÷ venduto)`. I pagamenti sono quelli delle categorie
// marcate «quota partner» nel CFO. Il 40% resta solo come ripiego dichiarato,
// per gli anni in cui la banca non copre abbastanza da poter misurare.
export const QUOTA_FATTURATO = 40;

export type Quota = {
  percentuale: number;
  misurata: boolean;
  // Come si è arrivati a quel numero: la pagina lo scrive invece di mostrare
  // una percentuale senza padre.
  spiegazione: string;
  // La stessa cosa in due parole, per le testate («regola di Orders»,
  // «misurata», «stimata»): senza, le pagine scrivevano «misurata» anche
  // quando la quota era una regola letta dal proprietario.
  etichetta?: string;
  // La quota di OGNI maison (slug → percentuale), quando la fonte la sa dire
  // per brand (26/08/2026: i brand non marginano uguale, e il budget di una
  // maison si converte con la SUA quota, non con la media). Assente = vale la
  // sola `percentuale` per tutte.
  perMaison?: Record<string, number>;
};

export const QUOTA_STIMATA: Quota = {
  percentuale: QUOTA_FATTURATO,
  misurata: false,
  spiegazione: `stima del ${QUOTA_FATTURATO}%: non ci sono abbastanza dati di banca per misurare quanto è stato girato ai partner`,
};

// La quota misurata. `null` se il venduto è zero o se i pagamenti ai partner
// coprono meno mesi del venduto — misurare mezzo anno di pagamenti contro un
// anno di vendite darebbe una quota altissima e falsa.
export function quotaMisurata(
  venduto: number,
  pagatoAiPartner: number,
  mesiVenduto: number,
  mesiPagamenti: number
): Quota | null {
  if (venduto <= 0 || pagatoAiPartner <= 0) return null;
  if (mesiPagamenti < mesiVenduto) return null;
  const quota = (1 - pagatoAiPartner / venduto) * 100;
  // Fuori da questa forchetta non è una quota: è un dato che non torna, e
  // spacciarlo per misura sarebbe peggio della stima.
  if (quota <= 0 || quota >= 90) return null;
  return {
    percentuale: Math.round(quota * 10) / 10,
    misurata: true,
    spiegazione: `misurata sui dati: venduto ${Math.round(venduto).toLocaleString("it-IT")} € meno ${Math.round(pagatoAiPartner).toLocaleString("it-IT")} € girati ai partner`,
  };
}

export function fatturatoDaVenduto(venduto: number, quota: Quota = QUOTA_STIMATA): number {
  return venduto * (quota.percentuale / 100);
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

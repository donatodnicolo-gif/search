// **Il ricavo dell'ecommerce, come nasce davvero** (definizione dell'utente,
// 29/07/2026).
//
// Quello che entra in cassa dai negozi non è un ricavo: una parte è denaro dei
// partner. Ma la parte che resta a Deluxy non è una percentuale unica — è la
// somma di due mestieri diversi:
//
//  1. gli ordini eseguiti dai **partner vendor**: lì Deluxy fattura una **fee
//     sua**, concordata partner per partner (dal 15% al 25%). Non si stima:
//     Finance la tiene scritta e la applica vendita per vendita;
//  2. gli ordini eseguiti comprando dai **fornitori**: lì il ricavo è quanto
//     resta dopo aver pagato la merce, e finché le riconciliazioni non ci sono
//     si usa una **percentuale dichiarata**.
//
// Perché non basta più la quota misurata dalla banca (`1 − pagato ÷ venduto`):
// quel conto divide **tutti** i pagamenti ai fioristi per il **solo** venduto
// dei negozi, quindi ci mette dentro anche i fioristi che hanno eseguito ordini
// B2B ed eventi. Il risultato peggiorava ogni volta che si classificava meglio
// la banca — 39,1% a inizio giornata, 27,1% a fine — che è il contrario di come
// dovrebbe comportarsi una misura.
//
// **Un mese senza vendite vendor caricate non è un mese senza partner**: le
// vendite si inseriscono a mano in Finance, e un mese vuoto farebbe finire
// tutto l'incasso fra i «fornitori», gonfiando il ricavo con la percentuale
// stimata. Quei mesi si dichiarano **non misurati** invece di essere calcolati.

import { chiave } from "./chiavi";
import { RIVALIDA } from "./cache";

const BASE = process.env.FINANCE_API_URL ?? "https://deluxy-partner.vercel.app";

// Quanto resta a Deluxy sugli ordini eseguiti comprando dai fornitori. È una
// **stima dichiarata**, decisa dall'utente in attesa delle riconciliazioni:
// quando ci saranno, questo numero si sostituisce con il margine misurato.
export const MARGINE_FORNITORI = 35;

// **Il venduto dei vendor registrato in Finance è al NETTO del nostro margine.**
// Non è una stima: è come il dato è fatto. Sui 27.685,60 € di gennaio 2026 il
// venduto vero al cliente è 34.607 € — quei 27.685 sono l'80% — e la differenza
// (6.921 €) è margine nostro che si somma alla fee fatturata. Senza questa
// rettifica il ricavo dell'ecommerce risultava di un terzo più basso, e il
// venduto "dei fornitori" di altrettanto più alto.
//
// Si toglie il giorno in cui Finance registrerà il lordo: allora questa costante
// va a 0 e il conto non cambia di una virgola.
export const RETTIFICA_VENDOR = 20;

// Sotto questa soglia il mese è considerato **non caricato**: nei mesi pieni il
// venduto dei partner sta fra il 40% e il 60% dell'incasso, quindi un 3% non è
// «pochi partner», è il foglio non ancora inserito.
const SOGLIA_CARICATO = 15;

export type MeseD2C = {
  mese: number;
  incasso: number;
  vendutoPartner: number;
  fee: number; // fatturato ai vendor: venduto × fee di ciascun partner
  vendutoFornitori: number;
  margineFornitori: number; // stimato
  ricavo: number; // fee + margine stimato
  caricato: boolean; // false = vendite vendor non inserite in Finance
  partner: number;
};

export type RicavoD2C = {
  ok: boolean;
  errore?: string;
  mesi: MeseD2C[];
  // I totali contano **solo i mesi caricati**: sommare un mese non caricato
  // vorrebbe dire spacciare per ricavo il 25% di tutto il suo incasso.
  totale: { incasso: number; vendutoPartner: number; fee: number; vendutoFornitori: number; ricavo: number };
  mesiNonCaricati: number[];
};

type RispostaVendor = {
  mesi: { mese: number; venduto: number; commissioni: number; righe: number; partner: number }[];
};

export async function ricavoD2C(anno: number, incassoMese: number[]): Promise<RicavoD2C> {
  const vuoto: RicavoD2C = {
    ok: false,
    mesi: [],
    totale: { incasso: 0, vendutoPartner: 0, fee: 0, vendutoFornitori: 0, ricavo: 0 },
    mesiNonCaricati: [],
  };
  const key = await chiave("FINANCE_API_KEY");
  if (!key) return { ...vuoto, errore: "Chiave Finance non configurata." };

  let dati: RispostaVendor | null = null;
  try {
    const res = await fetch(`${BASE}/api/vendor?anno=${anno}`, {
      headers: { "X-API-Key": key, "X-App": "deluxy-budgets" },
      next: { revalidate: RIVALIDA },
    });
    if (res.ok) {
      const j = (await res.json()) as RispostaVendor;
      if (Array.isArray(j?.mesi)) dati = j;
    }
  } catch {
    // Finance non raggiungibile: si dichiara, non si inventa
  }
  if (!dati) {
    return { ...vuoto, errore: "Le vendite dei partner non sono disponibili da Finance (serve /api/vendor)." };
  }

  const mesi: MeseD2C[] = [];
  for (let m = 1; m <= 12; m++) {
    const v = dati.mesi.find((x) => x.mese === m);
    const incasso = incassoMese[m - 1] ?? 0;
    const registrato = v?.venduto ?? 0;
    // Dal netto al lordo: 27.685,60 × 100/80 = 34.607
    const vendutoPartner = registrato * (100 / (100 - RETTIFICA_VENDOR));
    const margineVendor = vendutoPartner - registrato;
    const fee = (v?.commissioni ?? 0) + margineVendor;
    const caricato = incasso > 0 && (registrato / incasso) * 100 >= SOGLIA_CARICATO;
    const vendutoFornitori = Math.max(0, incasso - vendutoPartner);
    const margineFornitori = (vendutoFornitori * MARGINE_FORNITORI) / 100;
    mesi.push({
      mese: m,
      incasso,
      vendutoPartner,
      fee,
      vendutoFornitori,
      margineFornitori,
      ricavo: fee + margineFornitori,
      caricato,
      partner: v?.partner ?? 0,
    });
  }

  const buoni = mesi.filter((x) => x.caricato);
  const somma = (f: (x: MeseD2C) => number) => buoni.reduce((s, x) => s + f(x), 0);
  return {
    ok: true,
    mesi,
    totale: {
      incasso: somma((x) => x.incasso),
      vendutoPartner: somma((x) => x.vendutoPartner),
      fee: somma((x) => x.fee),
      vendutoFornitori: somma((x) => x.vendutoFornitori),
      ricavo: somma((x) => x.ricavo),
    },
    mesiNonCaricati: mesi.filter((x) => !x.caricato && x.incasso > 0).map((x) => x.mese),
  };
}

// Il ricavo dei soli mesi richiesti (il periodo che la pagina sta guardando),
// contando solo quelli caricati.
export function ricavoDeiMesi(r: RicavoD2C, mesi: number[]): { ricavo: number; fee: number; nonCaricati: number[] } {
  const scelti = r.mesi.filter((x) => mesi.includes(x.mese));
  const buoni = scelti.filter((x) => x.caricato);
  return {
    ricavo: buoni.reduce((s, x) => s + x.ricavo, 0),
    fee: buoni.reduce((s, x) => s + x.fee, 0),
    nonCaricati: scelti.filter((x) => !x.caricato && x.incasso > 0).map((x) => x.mese),
  };
}

// Il ricavo dell'ecommerce MISURATO: primo margine + fee dall'economia della
// vendita che la piattaforma consegne scrive sugli ordini di Orders.
//
// Decisione dell'utente (26/08/2026): la riga ecommerce del consuntivo è
// **primo margine + fee** degli ordini che hanno il dato, con il residuo
// scoperto dichiarato — sostituisce la stima, non la affianca. Il primo margine
// è (pagato − valore prodotti) ÷ 1,22, quindi già al netto IVA; le fee sono le
// commissioni incassate dai partner (lorde). Tutto arriva da /api/v1/ricavi di
// Orders: qui non si calcola niente, si somma e si dichiara.
//
// La cascata resta per i mesi in cui la misura non c'è (anni passati, mesi
// futuri, un giro della piattaforma saltato): un mese si considera misurato
// solo se l'economia copre almeno metà del lordo — sotto, la somma parziale
// spacciata per ricavo del mese sarebbe un buco travestito da crollo — e chi
// chiama torna al metodo precedente (fee vendor / quota), dichiarandolo.

import type { RicaviResult } from "./orders";

// % del lordo del mese che l'economia deve coprire perché il mese sia
// «misurato». A copertura piena i mesi 2026 stanno fra l'83% e il 98%.
export const SOGLIA_MISURATO = 50;

export type MeseEconomia = {
  mese: number;
  lordo: number;
  lordoCoperto: number;
  coperturaPct: number; // lordoCoperto ÷ lordo, in %
  fee: number;
  primoMargine: number;
  ricavo: number; // fee + primo margine (solo ordini col dato)
  ordini: number;
  ordiniConEconomia: number;
  misurato: boolean;
};

export type EconomiaD2C = {
  // false = l'Orders interrogato non espone ancora i campi dell'economia
  // (versione vecchia): un avviso diverso da «nessun ordine col dato».
  esposta: boolean;
  mesi: MeseEconomia[]; // sempre 12
};

const VUOTO_MESE = (m: number): MeseEconomia => ({
  mese: m, lordo: 0, lordoCoperto: 0, coperturaPct: 0,
  fee: 0, primoMargine: 0, ricavo: 0, ordini: 0, ordiniConEconomia: 0, misurato: false,
});

export function economiaD2C(res: RicaviResult): EconomiaD2C {
  if (!res.ok) return { esposta: false, mesi: Array.from({ length: 12 }, (_, i) => VUOTO_MESE(i + 1)) };
  const esposta = res.dati.brand.some((b) => Array.isArray(b.feeMese));
  const mesi = Array.from({ length: 12 }, (_, i) => VUOTO_MESE(i + 1));
  for (const b of res.dati.brand) {
    for (let i = 0; i < 12; i++) {
      const r = mesi[i];
      r.lordo += b.mesi[i] ?? 0;
      r.ordini += b.ordiniMese[i] ?? 0;
      r.lordoCoperto += b.lordoConEconomiaMese?.[i] ?? 0;
      r.fee += b.feeMese?.[i] ?? 0;
      r.primoMargine += b.primoMargineMese?.[i] ?? 0;
      r.ordiniConEconomia += b.conEconomiaMese?.[i] ?? 0;
    }
  }
  for (const r of mesi) {
    r.ricavo = r.fee + r.primoMargine;
    r.coperturaPct = r.lordo > 0 ? (r.lordoCoperto / r.lordo) * 100 : 0;
    r.misurato = esposta && r.lordo > 0 && r.coperturaPct >= SOGLIA_MISURATO;
  }
  return { esposta, mesi };
}

// Il riepilogo dei mesi richiesti: le somme valgono sui SOLI mesi misurati, e
// accanto viaggiano il residuo scoperto (lordo degli ordini senza dato nei mesi
// misurati) e l'elenco dei mesi in cui la misura non c'è — che restano al
// metodo di ripiego di chi chiama, non a zero.
export function economiaDeiMesi(
  e: EconomiaD2C,
  mesi: number[]
): {
  ricavo: number;
  fee: number;
  primoMargine: number;
  lordo: number;
  lordoCoperto: number;
  lordoScoperto: number;
  ordini: number;
  ordiniConEconomia: number;
  mesiMisurati: number[];
  mesiNonMisurati: number[];
} {
  const scelti = e.mesi.filter((x) => mesi.includes(x.mese));
  const buoni = scelti.filter((x) => x.misurato);
  const somma = (f: (x: MeseEconomia) => number) => buoni.reduce((s, x) => s + f(x), 0);
  return {
    ricavo: somma((x) => x.ricavo),
    fee: somma((x) => x.fee),
    primoMargine: somma((x) => x.primoMargine),
    lordo: somma((x) => x.lordo),
    lordoCoperto: somma((x) => x.lordoCoperto),
    lordoScoperto: somma((x) => x.lordo - x.lordoCoperto),
    ordini: somma((x) => x.ordini),
    ordiniConEconomia: somma((x) => x.ordiniConEconomia),
    mesiMisurati: buoni.map((x) => x.mese),
    mesiNonMisurati: scelti.filter((x) => !x.misurato && x.lordo > 0).map((x) => x.mese),
  };
}

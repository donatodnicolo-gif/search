// Il conto economico **civilistico** (art. 2425 c.c.): il bilancio vero, quello
// che va dal commercialista, non la ricostruzione gestionale dai movimenti di
// banca.
//
// Perché tenerli separati invece di sostituire l'uno con l'altro:
//  - il **gestionale** (Consuntivo, CFO) risponde a «come sta andando adesso»:
//    è veloce, arriva a oggi, ma è fatto di uscite di cassa categorizzate a
//    mano e non conosce ammortamenti, ratei, rimanenze;
//  - il **bilancio** risponde a «cosa abbiamo chiuso»: è completo e quadrato,
//    ma esiste solo dopo la chiusura dell'esercizio.
// Confrontarli non è un doppione: è il modo per scoprire cosa manca nell'uno
// (spese non categorizzate) o nell'altro (mesi ancora aperti).
//
// Lo schema qui sotto è quello di legge, nell'ordine di legge. Non si
// "semplifica": chi apre questa pagina si aspetta di ritrovare le stesse voci
// che ha sul PDF del commercialista, con gli stessi codici.

import { prisma } from "./db";

export * from "./bilancio-voci";
import { leggiMesi } from "./bilancio-voci";

export type ValoreVoce = { codice: string; importo: number; mesi: number[] | null; nota: string | null };


export async function caricaBilancio(anno: number): Promise<ValoreVoce[]> {
  const righe = await prisma.voceBilancio.findMany({ where: { anno } }).catch(() => []);
  return righe.map((r) => ({ codice: r.codice, importo: r.importo, mesi: leggiMesi(r.mesi), nota: r.nota }));
}

export async function anniConBilancio(): Promise<number[]> {
  const righe = await prisma.voceBilancio.findMany({ distinct: ["anno"], select: { anno: true }, orderBy: { anno: "desc" } }).catch(() => []);
  return righe.map((r) => r.anno);
}


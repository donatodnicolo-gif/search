// IL COSTO DELLE CONSEGNE, letto dalla PIATTAFORMA CONSEGNE (27/08/2026).
//
// Richiesta dell'utente: «prendi per costi di servizi di consegne i valori
// delle consegne da app delivery, comprese le aggiunte delle ritenute per
// quelli non in partita IVA» — e, subito dopo, la precisazione che conta:
// «il costo delle consegne lo devi prendere però da app delivery».
//
// ⭐ **Perché dalla piattaforma e non dalla banca.** Finché questa riga sono
// state le uscite di banca categorizzate «Consegne (valet e corrieri)», il
// conto economico vedeva **meno di un terzo** del costo vero: misurato su
// Gen–Lug 2026, **29.561 € in banca contro 102.080 €** di consegne davvero
// fatte. La differenza non è cassa trattenuta dai valet (sono 4.366 €) e non è
// solo arretrato (34.112 € non ancora pagati): il resto sono pagamenti usciti
// e finiti in altre caselle. Una classificazione di banca non sa riconoscere un
// valet da un fioraio guardando il nome, la piattaforma sì — perché la consegna
// è roba sua.
//
// ⭐ **E perché non da Orders**, che pure ne ha una copia per ordine
// (`costoConsegna`): quella copia è l'ingrediente del margine di Orders e
// copre solo gli ordini D2C passati dalla piattaforma — 31.799 € sul 2026,
// contro 108.257 € di consegne totali. La casa del numero è la piattaforma
// (Standard Deluxy §7): si legge dal proprietario, non di sponda.
//
// ⚠️⚠️ **CAMBIA LA BASE, E VA DETTO.** Il resto dei costi di questa app è
// **cassa** (quello che è uscito dal conto); questo numero è **competenza** (le
// consegne fatte nel periodo, pagate o no). Sui mesi chiusi del 2026 dentro ci
// sono **34.112 € non ancora pagati**: sono un costo dell'anno e un debito, non
// un'uscita. Chi confronta questa riga con l'estratto conto non la ritrova, ed
// è giusto così — ma se non è scritto sembra un errore.
//
// Convenzione dei nomi come in Orders (Standard §4.4): `PLATFORM_URL` +
// `PLATFORM_API_KEY`, chiave generata sulla piattaforma con
// `api/scripts/crea-chiave-app.mjs deluxy-budgets`.

import { chiave } from "./chiavi";
import { RIVALIDA } from "./cache";

/** Il conto di un insieme di consegne: paga e ritenuta restano separate. */
export type ContoConsegne = {
  consegne: number;
  /** Quanto va al valet: salario + il plus fino a 5 €, zero se non pagabile. */
  paga: number;
  /**
   * La ritenuta d'acconto dei valet **senza partita IVA**, che Deluxy versa
   * all'erario **in più** rispetto al bonifico. È costo, non trattenuta: chi
   * legge solo `paga` sottostima di questa cifra.
   */
  ritenute: number;
  /** paga + ritenute. */
  costo: number;
  nonPagabili: number;
};

export type CostiConsegne = {
  ok: boolean;
  /** Perché non c'è, quando non c'è: uno zero non deve passare per un dato. */
  errore?: string;
  totali: ContoConsegne & {
    valetSenzaPartitaIva: number;
    valetConPartitaIva: number;
    nonConsegnateTenute: number;
    nonConsegnateScartate: number;
  };
  /** Dodici caselle, indice 0 = gennaio. */
  mesi: ContoConsegne[];
  perShop: (ContoConsegne & { shop: string })[];
  regola: string;
};

const VUOTO: ContoConsegne = { consegne: 0, paga: 0, ritenute: 0, costo: 0, nonPagabili: 0 };

/**
 * Il costo delle consegne di un anno, mese per mese.
 *
 * Best effort come tutte le letture verso le altre app: se la piattaforma non
 * risponde si torna `ok: false` con il motivo, e chi chiama **dichiara** che il
 * dato manca invece di mettere uno zero.
 */
export async function fetchCostiConsegne(anno: number): Promise<CostiConsegne> {
  const vuoto = (errore: string): CostiConsegne => ({
    ok: false,
    errore,
    totali: {
      ...VUOTO,
      valetSenzaPartitaIva: 0,
      valetConPartitaIva: 0,
      nonConsegnateTenute: 0,
      nonConsegnateScartate: 0,
    },
    mesi: Array.from({ length: 12 }, () => ({ ...VUOTO })),
    perShop: [],
    regola: "",
  });

  const url = (process.env.PLATFORM_URL ?? "https://deluxy-delivery.vercel.app")
    .trim()
    .replace(/\/$/, "");
  const k = ((await chiave("PLATFORM_API_KEY")) ?? "")
    .trim()
    // Un BOM incollato insieme alla chiave non è un carattere della chiave.
    .replace(/^﻿/, "");
  if (!k) return vuoto("PLATFORM_API_KEY non configurata");

  try {
    const r = await fetch(`${url}/api/v1/app/costi-consegne?anno=${anno}`, {
      headers: { "x-api-key": k },
      next: { revalidate: RIVALIDA },
    });
    if (!r.ok) return vuoto(`la piattaforma ha risposto ${r.status}`);
    const d = (await r.json()) as {
      totali?: CostiConsegne["totali"];
      mesi?: (ContoConsegne & { mese: number })[];
      perShop?: CostiConsegne["perShop"];
      regola?: string;
    };
    if (!d?.totali || !Array.isArray(d.mesi)) return vuoto("risposta senza totali");
    const mesi = Array.from({ length: 12 }, () => ({ ...VUOTO }));
    for (const m of d.mesi) {
      if (m.mese >= 1 && m.mese <= 12) mesi[m.mese - 1] = { ...VUOTO, ...m };
    }
    return {
      ok: true,
      totali: d.totali,
      mesi,
      perShop: d.perShop ?? [],
      regola: d.regola ?? "",
    };
  } catch (e) {
    return vuoto(e instanceof Error ? e.message : "errore di rete");
  }
}

/** La somma delle sole caselle dei mesi richiesti. */
export function consegneDeiMesi(c: CostiConsegne, mesi: number[]): ContoConsegne {
  const out: ContoConsegne = { ...VUOTO };
  for (const m of mesi) {
    const x = c.mesi[m - 1];
    if (!x) continue;
    out.consegne += x.consegne;
    out.paga += x.paga;
    out.ritenute += x.ritenute;
    out.costo += x.costo;
    out.nonPagabili += x.nonPagabili;
  }
  return out;
}

/**
 * LA SOSTITUZIONE, in un posto solo.
 *
 * ⚠️ Sta qui e non nelle pagine per la ragione che questa app ha già pagato tre
 * volte: `/consuntivo` e `/pl` fanno il conto dei costi **ognuna per conto
 * suo**, e ogni volta che una regola è stata scritta in due punti i due numeri
 * hanno finito per divergere — lo stesso «EBITDA» è arrivato a valere tre cose
 * diverse. Chi tocca questa funzione le cambia tutt'e due.
 *
 * Restituisce il **delta mese per mese** da applicare al costo del venduto
 * (togli la banca, metti la piattaforma) e il blocco da mostrare a schermo.
 * Fuori dai mesi del periodo il delta è zero.
 */
export type SostituzioneConsegne = {
  conto: ContoConsegne;
  /** Quanto valeva in banca la categoria sostituita, sugli stessi mesi. */
  inBanca: number;
  /** Di quanto si muove il costo del venduto per effetto della sostituzione. */
  differenza: number;
  /** false = categoria di banca non trovata: NON si è sostituito nulla. */
  sostituita: boolean;
  regola: string;
};

export function sostituzioneConsegne(
  costiConsegne: CostiConsegne,
  rigaBancaPerMese: number[] | null,
  mesi: number[]
): { delta: number[]; esposta: SostituzioneConsegne | null } {
  const delta = Array(12).fill(0) as number[];
  if (!costiConsegne.ok) return { delta, esposta: null };

  const conto = consegneDeiMesi(costiConsegne, mesi);
  let inBanca = 0;
  if (rigaBancaPerMese) {
    for (const m of mesi) {
      const i = m - 1;
      const dallaBanca = rigaBancaPerMese[i] ?? 0;
      inBanca += dallaBanca;
      delta[i] = (costiConsegne.mesi[i]?.costo ?? 0) - dallaBanca;
    }
  }
  return {
    delta,
    esposta: {
      conto,
      inBanca,
      differenza: rigaBancaPerMese ? conto.costo - inBanca : 0,
      sostituita: Boolean(rigaBancaPerMese),
      regola: costiConsegne.regola,
    },
  };
}

/** Trova la riga di banca da sostituire, per nome, senza distinzione di maiuscole. */
export function rigaBancaConsegne<T extends { categoria: { nome: string } | null; perMese: number[] }>(
  righe: T[]
): T | null {
  return (
    righe.find(
      (r) => r.categoria?.nome?.trim().toLowerCase() === CATEGORIA_CONSEGNE_BANCA.toLowerCase()
    ) ?? null
  );
}

/**
 * Il nome della categoria di banca che questa fonte **sostituisce**.
 *
 * ⚠️ Si sostituisce, non si affianca: sommare le due vorrebbe dire contare due
 * volte i bonifici ai valet che in banca ci sono. E si sostituisce **solo
 * quella riga**: nel costo del venduto ci stanno anche i fornitori degli
 * eventi e i materiali, che con le consegne non c'entrano.
 *
 * ⚠️ Il nome è quello scritto nel CFO. Se qualcuno rinomina la categoria, qui
 * non scatta più niente — e allora il conto **dichiara** che non ha sostituito
 * nulla, invece di lasciar credere di averlo fatto.
 */
export const CATEGORIA_CONSEGNE_BANCA = "Consegne (valet e corrieri)";

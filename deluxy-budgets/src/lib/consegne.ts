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
  /**
   * Il dettaglio **per persona e per mese**, che serve a togliere i valet che
   * questa app paga già come **dipendenti**: il loro costo sta nella riga
   * «personale», presa dall'anagrafica Dipendenti, e sommarci anche la paga per
   * consegna li conta due volte. La piattaforma non sa chi è a libro paga — il
   * roster vive qui — quindi manda tutto e la scelta la fa chi ha il dato.
   */
  perValet: {
    id: string;
    nome: string;
    partitaIva: boolean;
    consegne: number;
    paga: number;
    ritenute: number;
    costo: number;
    mesi: (ContoConsegne & { mese: number })[];
  }[];
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
/**
 * @param opzioni.senzaCache salta la finestra di 60 secondi e chiede il valore
 *   di **adesso**.
 *
 * ⚠️⚠️ **Serve a chi CONFRONTA, e non è un dettaglio di prestazioni.** La cache
 * va benissimo per disegnare una pagina: nessuna decisione cambia perché un
 * totale è vecchio di un minuto. Ma la sentinella dei mesi chiusi mette a
 * paragone la lettura di oggi con quella di ieri: se una delle due arriva dalla
 * cache, una risposta vecchia si presenta come un **cambiamento** che non è mai
 * avvenuto. È successo davvero la prima notte in cui è stata accesa — ha
 * segnalato tutti e sette i mesi chiusi, e non si era mosso niente.
 * ⭐ *Chi confronta due letture non può permettersi che una delle due sia vecchia.*
 */
export async function fetchCostiConsegne(
  anno: number,
  opzioni: { senzaCache?: boolean } = {}
): Promise<CostiConsegne> {
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
    perValet: [],
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
      ...(opzioni.senzaCache ? { cache: "no-store" as const } : { next: { revalidate: RIVALIDA } }),
    });
    if (!r.ok) return vuoto(`la piattaforma ha risposto ${r.status}`);
    const d = (await r.json()) as {
      totali?: CostiConsegne["totali"];
      mesi?: (ContoConsegne & { mese: number })[];
      perShop?: CostiConsegne["perShop"];
      perValet?: CostiConsegne["perValet"];
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
      perValet: d.perValet ?? [],
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
  /** I valet che sono anche a libro paga: tolti dal costo, e detti per nome. */
  giaNelPersonale: { nome: string; costo: number }[];
  /** Quanto è stato tolto per non contarli due volte, sui mesi del periodo. */
  toltoPerchePersonale: number;
};

/**
 * CHI È GIÀ A LIBRO PAGA NON SI PAGA DUE VOLTE (27/08/2026, segnalato
 * dall'utente: «mannini e cassoli vanno contati come dipendenti»).
 *
 * Alcuni valet sono **dipendenti**: il loro costo sta già nella riga
 * «personale» del conto economico, che viene dall'anagrafica Dipendenti e non
 * dalla banca. La paga per consegna che la piattaforma calcola su di loro è il
 * costo *figurato* di quella consegna, non un secondo bonifico — sommarla
 * significa pagarli due volte nel conto.
 *
 * ⚠️ **Il confronto è per NOME, e un nome non è un'identità**: si richiede che
 * tutti i pezzi del nome nel roster (almeno due, di 3 lettere o più) compaiano
 * nel nome del valet. Un omonimo la passerebbe: per questo la funzione
 * restituisce **chi ha tolto e per quanto**, e le pagine lo scrivono, invece di
 * far sparire un costo in silenzio.
 */
/**
 * I VALET CHE SONO UNA PERSONA DEL ROSTER SOTTO UN ALTRO NOME.
 *
 * ⭐ **Confermato dall'utente, non dedotto** (27/08/2026) — stessa scelta e
 * stessa ragione dell'abbinamento fra i brand di Marketing e le maison: qui
 * nessuna regola automatica può arrivarci, e indovinare vorrebbe dire togliere
 * dal conto il costo di una persona che non è quella.
 *
 * Il caso: a libro paga la persona si chiama **«Nicolò Donato»**, come valet è
 * registrata **«ADonato Daniele»**. Nessun confronto per nome le mette insieme
 * — «nicolo» non compare in «adonato daniele» — quindi le sue consegne
 * sarebbero contate **oltre** al suo stipendio.
 *
 * Chiave: il nome del valet come lo scrive la piattaforma (senza distinzione di
 * maiuscole). Valore: il nome nel roster degli stipendi. Aggiungere una riga
 * qui è una **decisione**, e va presa con chi conosce le persone.
 */
export const VALET_A_LIBRO_PAGA: Record<string, string> = {
  "adonato daniele": "Nicolò Donato",
};

export function valetGiaNelPersonale(
  costiConsegne: CostiConsegne,
  nomiRoster: string[]
): { id: string; nome: string; costo: number; mesi: number[] }[] {
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
     .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const pezziRoster = nomiRoster
    .map((n) => norm(n).split(" ").filter((p) => p.length >= 3))
    .filter((p) => p.length >= 2);

  // I nomi confermati a mano, normalizzati una volta sola.
  const espliciti = new Set(Object.keys(VALET_A_LIBRO_PAGA).map((k) => norm(k)));

  const out: { id: string; nome: string; costo: number; mesi: number[] }[] = [];
  for (const v of costiConsegne.perValet) {
    const nv = norm(v.nome);
    // Due strade: il nome che combacia col roster, oppure l'abbinamento
    // dichiarato a mano. La seconda esiste perché la prima non può arrivarci.
    const perNome = pezziRoster.some((pezzi) => pezzi.every((p) => nv.includes(p)));
    if (!perNome && !espliciti.has(nv)) continue;
    const mesi = Array(12).fill(0) as number[];
    for (const m of v.mesi) if (m.mese >= 1 && m.mese <= 12) mesi[m.mese - 1] = m.costo;
    out.push({ id: v.id, nome: v.nome, costo: v.costo, mesi });
  }
  return out;
}

export function sostituzioneConsegne(
  costiConsegne: CostiConsegne,
  rigaBancaPerMese: number[] | null,
  mesi: number[],
  nomiRoster: string[] = []
): { delta: number[]; esposta: SostituzioneConsegne | null } {
  const delta = Array(12).fill(0) as number[];
  if (!costiConsegne.ok) return { delta, esposta: null };

  // Chi è a libro paga esce dal conto delle consegne, e si dichiara.
  const giaNelPersonale = valetGiaNelPersonale(costiConsegne, nomiRoster);
  const daTogliere = Array(12).fill(0) as number[];
  for (const v of giaNelPersonale) for (let i = 0; i < 12; i++) daTogliere[i] += v.mesi[i] ?? 0;

  const conto = consegneDeiMesi(costiConsegne, mesi);
  const scalato = mesi.reduce((s, m) => s + (daTogliere[m - 1] ?? 0), 0);
  conto.costo -= scalato;
  let inBanca = 0;
  if (rigaBancaPerMese) {
    for (const m of mesi) {
      const i = m - 1;
      const dallaBanca = rigaBancaPerMese[i] ?? 0;
      inBanca += dallaBanca;
      delta[i] = (costiConsegne.mesi[i]?.costo ?? 0) - (daTogliere[i] ?? 0) - dallaBanca;
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
      giaNelPersonale: giaNelPersonale.map((v) => ({ nome: v.nome, costo: v.costo })),
      toltoPerchePersonale: scalato,
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

// ---- I RICAVI dei servizi commerciali della piattaforma (30/08/2026) ----
//
// Richiesta dell'utente: «non solo il costo, devi prendere anche i ricavi
// delle consegne per i servizi fatti — servizi prezzo fisso e servizi orari».
// Rotta `GET /api/v1/app/ricavi-servizi`: il LISTINO dei servizi PREZZO_FISSO
// e A_ORA col lavoro fatto, per mese e per servizio. ⚠️ Non è il fatturato
// (quello resta Finance): è il numero VIVO del mese in corso, e chi lo mostra
// accanto a Finance NON lo somma — la fattura di questi servizi, quando
// arriva, entra di là.
export type RicaviServizi = {
  ok: boolean;
  errore?: string;
  totali: { n: number; ricavo: number; nonFatturabili: number };
  mesi: { mese: number; n: number; ricavo: number; nonFatturabili: number }[];
  perServizio: { nome: string; modello: string; n: number; ricavo: number; nonFatturabili: number }[];
};

export async function fetchRicaviServizi(anno: number, mese?: number): Promise<RicaviServizi> {
  // Con `mese` si chiede SOLO quel mese: così anche `perServizio` è del mese,
  // e chi disegna una sezione «in corso ad agosto» non mostra righe dell'anno.
  const qs = mese
    ? `dal=${anno}-${String(mese).padStart(2, "0")}-01&al=${mese === 12 ? `${anno + 1}-01-01` : `${anno}-${String(mese + 1).padStart(2, "0")}-01`}`
    : `anno=${anno}`;
  return ricaviServizi(qs);
}

/**
 * Lo stesso conto su un intervallo QUALSIASI di giorni (`al` escluso): serve
 * alla vista «Questa settimana», dove i servizi sono l'unico ricavo
 * commerciale che il giorno lo sa davvero — le fatture di Finance sono mensili.
 */
export async function fetchRicaviServiziIntervallo(dal: string, al: string): Promise<RicaviServizi> {
  return ricaviServizi(`dal=${dal}&al=${al}`);
}

async function ricaviServizi(qs: string): Promise<RicaviServizi> {
  const vuoto = (errore: string): RicaviServizi => ({
    ok: false, errore, totali: { n: 0, ricavo: 0, nonFatturabili: 0 }, mesi: [], perServizio: [],
  });
  const url = (process.env.PLATFORM_URL ?? "https://deluxy-delivery.vercel.app").trim().replace(/\/$/, "");
  const k = ((await chiave("PLATFORM_API_KEY")) ?? "").trim().replace(/^﻿/, "");
  if (!k) return vuoto("PLATFORM_API_KEY non configurata");
  try {
    const r = await fetch(`${url}/api/v1/app/ricavi-servizi?${qs}`, {
      headers: { "x-api-key": k },
      next: { revalidate: RIVALIDA },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return vuoto(`la piattaforma ha risposto ${r.status}`);
    const d = (await r.json()) as Partial<RicaviServizi>;
    if (!d?.ok || !Array.isArray(d.mesi)) return vuoto("risposta non riconosciuta");
    return { ok: true, totali: d.totali!, mesi: d.mesi, perServizio: d.perServizio ?? [] };
  } catch {
    return vuoto("piattaforma non raggiungibile");
  }
}

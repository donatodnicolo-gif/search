// Il periodo di osservazione dei dati reali, uguale per tutte le pagine del
// consuntivo (Venduto, Fatturato reale). Sta qui e non nelle pagine perché due
// schermate che rispondono alla stessa domanda su periodi diversi si
// contraddicono: se «YTD» significa una cosa nel Venduto e un'altra nel
// Fatturato, i numeri non tornano mai e nessuno capisce perché.

import { MESI } from "./format";

// I periodi confrontano sempre mele con mele — stessi mesi contro stessi mesi —
// TRANNE l'ultimo, «Anno», che è la vista di fine corsa: il consuntivo resta
// quello dei mesi già passati (YTD) ma budget e anno precedente si mostrano
// **interi**, per rispondere a «a che punto sono rispetto a tutto l'anno».
export const PERIODI = [
  { key: "ytd", label: "YTD", dal: 1, al: 12, annoIntero: false },
  { key: "t1", label: "T1", dal: 1, al: 3, annoIntero: false },
  { key: "t2", label: "T2", dal: 4, al: 6, annoIntero: false },
  { key: "t3", label: "T3", dal: 7, al: 9, annoIntero: false },
  { key: "t4", label: "T4", dal: 10, al: 12, annoIntero: false },
  { key: "s1", label: "1° sem", dal: 1, al: 6, annoIntero: false },
  { key: "s2", label: "2° sem", dal: 7, al: 12, annoIntero: false },
  { key: "anno", label: "Anno", dal: 1, al: 12, annoIntero: true },
];

export const etichettaMesi = (a: number, b: number) =>
  a === b ? MESI[a - 1] : `${MESI[a - 1]}–${MESI[b - 1]}`;

export function risolviPeriodo(sp: { periodo?: string; anno?: string; mese?: string }) {
  const periodo = PERIODI.find((p) => p.key === sp.periodo) ?? PERIODI[0];

  // Il consuntivo arriva **a oggi**: il mese in corso ci sta dentro, parziale.
  // Fermarsi all'ultimo mese chiuso significava, il 26 luglio, non sapere
  // niente di luglio — proprio quando la domanda su come sta andando il mese è
  // più viva.
  const oggi = new Date();
  const annoInCorso = oggi.getUTCFullYear();
  const meseInCorso = oggi.getUTCMonth() + 1; // 1..12
  const giornoInCorso = oggi.getUTCDate();
  const giorniDelMese = new Date(Date.UTC(annoInCorso, meseInCorso, 0)).getUTCDate();
  // Da quando esiste l'archivio: la banca parte dal 23/11/2020 (recuperata da
  // Qonto il 29/07/2026), quindi gli anni apribili arrivano fin lì. Prima non
  // c'è niente da vedere, e un anno vuoto nel selettore è solo un vicolo cieco.
  const PRIMO_ANNO = 2021;
  const ANNI = Array.from({ length: annoInCorso - PRIMO_ANNO + 1 }, (_, i) => PRIMO_ANNO + i);
  const anno = ANNI.includes(Number(sp.anno)) ? Number(sp.anno) : annoInCorso;

  // Ultimo mese disponibile per l'anno scelto: anni passati = 12, anno in corso
  // = quello attuale (parziale), anni futuri = 0.
  const meseLimite = anno < annoInCorso ? 12 : anno > annoInCorso ? 0 : meseInCorso;

  // **Un mese solo**, quando si arriva da una casella dello split mensile
  // (`?mese=7`). Sta qui e non nelle pagine per la stessa ragione dei periodi:
  // se «luglio» significasse una cosa nel consuntivo e un'altra nel suo
  // dettaglio, il dettaglio non sommerebbe al numero da cui si è cliccato. Un
  // mese fuori dal periodo o non ancora cominciato si ignora: si torna al
  // periodo intero invece di mostrare una pagina vuota.
  const meseChiesto = Number(sp.mese);
  const unMese =
    Number.isInteger(meseChiesto) &&
    meseChiesto >= periodo.dal &&
    meseChiesto <= Math.min(periodo.al, meseLimite)
      ? meseChiesto
      : null;

  const dal = unMese ?? periodo.dal;
  const al = unMese ?? Math.min(periodo.al, meseLimite);
  const mesiPeriodo: number[] = [];
  for (let m = dal; m <= al; m++) mesiPeriodo.push(m);
  const vuoto = mesiPeriodo.length === 0;
  const parziale = anno === annoInCorso && mesiPeriodo.includes(meseInCorso);

  // Il termine di paragone: stesso periodo, oppure l'anno intero nella vista «Anno».
  const annoPrec = anno - 1;
  const rifDal = periodo.annoIntero ? 1 : dal;
  const rifAl = periodo.annoIntero ? 12 : al;
  const mesiRif: number[] = [];
  for (let m = rifDal; m <= rifAl; m++) mesiRif.push(m);

  // Data (esclusiva) a cui fermare l'anno precedente per le vendite ecommerce:
  // 26 giorni di luglio vanno confrontati con 26 giorni di luglio. Solo se il
  // mese aperto è dentro il riferimento — nella vista «Anno» il paragone è
  // l'anno intero e non va tagliato.
  const tagliaPrec =
    parziale && !periodo.annoIntero
      ? new Date(Date.UTC(annoPrec, meseInCorso - 1, giornoInCorso + 1)).toISOString().slice(0, 10)
      : undefined;

  const etichettaPeriodo = vuoto ? "—" : etichettaMesi(dal, al);

  return {
    periodo,
    // Il mese singolo su cui si è ristretto, `null` se si guarda tutto il
    // periodo: le pagine lo dicono in chiaro, altrimenti un totale piccolo
    // sembra un crollo invece che un mese.
    unMese,
    anno,
    annoPrec,
    ANNI,
    annoInCorso,
    meseInCorso,
    giornoInCorso,
    giorniDelMese,
    meseLimite,
    dal,
    al,
    mesiPeriodo,
    mesiRif,
    rifDal,
    rifAl,
    vuoto,
    parziale,
    tagliaPrec,
    etichettaPeriodo,
    etichettaRif: periodo.annoIntero ? "anno intero" : etichettaPeriodo,
    ultimoMese: meseLimite >= 1 ? `${MESI[meseLimite - 1]} ${anno}` : "—",
    meseAperto: `${MESI[meseInCorso - 1]} ${anno}`,
  };
}

// Variazione percentuale. Con una base a zero la percentuale non esiste (non è
// "+100%", è "da zero"): null, e la colonna mostra "—".
export function variazione(ora: number, prima: number | null): number | null {
  return prima === null || prima === 0 ? null : ((ora - prima) / Math.abs(prima)) * 100;
}

// Quota di un riferimento intero già coperta: si usa nella vista «Anno», dove
// un "+/−" mentirebbe (non è un calo, è un anno non ancora finito).
export function quota(ora: number, rif: number | null): number | null {
  return rif === null || rif === 0 ? null : (ora / rif) * 100;
}

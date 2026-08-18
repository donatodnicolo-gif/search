/**
 * Deluxy Fondo — tipi condivisi.
 *
 * Regola generale del progetto: un dato che non c'è vale `null`, MAI 0.
 * Chi calcola deve escludere le variabili mancanti e rinormalizzare i pesi
 * (vedi docs/analisi/04-metodo-quantitativo.md).
 */

/** Quanto ci si può fidare di un dato raccolto da fonti pubbliche. */
export type Confidenza = "alta" | "media" | "bassa";

/** Una barra di prezzo giornaliera, già aggiustata per dividendi/split. */
export type Barra = {
  /** ISO `YYYY-MM-DD` (giorno di borsa). */
  data: string;
  apertura: number | null;
  massimo: number | null;
  minimo: number | null;
  chiusura: number;
  volume: number | null;
};

export type SerieStorica = {
  simbolo: string;
  nome: string;
  valuta: string;
  fonte: string;
  /** Quando la serie è stata scaricata (ISO datetime). */
  scaricataIl: string;
  barre: Barra[];
};

/** Tier dell'evento di management: quanto è informativo (vedi analisi 4). */
export type TierEvento = "T1" | "T2" | "T3" | "T4";

export const PESO_TIER: Record<TierEvento, number> = {
  T1: 1.0,
  T2: 0.8,
  T3: 0.5,
  T4: 0.3,
};

export type EventoManagement = {
  id: string;
  simbolo: string;
  /** Prima menzione credibile in stampa (ISO `YYYY-MM-DD`), se nota. */
  dataRumor: string | null;
  /** Annuncio ufficiale: è la data primaria dell'evento. */
  dataAnnuncio: string;
  /** Efficacia (assemblea, cooptazione), se diversa dall'annuncio. */
  dataEfficacia: string | null;
  tier: TierEvento;
  titolo: string;
  descrizione: string;
  /** Il predecessore è uscito in modo non programmato? `null` se non accertabile. */
  forzato: boolean | null;
  /** Il successore viene da fuori dal gruppo? `null` se non accertabile. */
  successoreEsterno: boolean | null;
  /** Nella finestra [-2,+2] cadono risultati, M&A, aumenti di capitale, guidance. */
  contaminato: boolean;
  confidenza: Confidenza;
  fonti: Fonte[];
};

export type Fonte = {
  titolo: string;
  url: string;
  /** ISO `YYYY-MM-DD`. */
  data: string | null;
};

/** Una riga di bilancio annuale, con la data in cui è diventata pubblica. */
export type Bilancio = {
  simbolo: string;
  /** Esercizio di riferimento, es. 2024. */
  esercizio: number;
  /** Chiusura esercizio (ISO). */
  chiusura: string;
  /**
   * Data di pubblicazione: prima di questa data il dato NON era conoscibile.
   * Senza di essa qualunque backtest ha look-ahead bias.
   */
  pubblicato: string | null;
  valuta: string;
  /** Milioni di valuta. `null` = non disponibile, non zero. */
  ricavi: number | null;
  ebitda: number | null;
  /** EBITDA after lease (EBITDAaL): il riferimento del settore telco. */
  ebitdaAL: number | null;
  risultatoNetto: number | null;
  /** Posizione finanziaria netta (positiva = debito). */
  debitoNetto: number | null;
  /** Free cash flow, definizione dichiarata dall'emittente. */
  fcf: number | null;
  patrimonioNetto: number | null;
  dipendenti: number | null;
  note: string | null;
  confidenza: Confidenza;
  fonti: Fonte[];
};

/** Esito di un blocco dello score: valore, copertura e dettaglio per variabile. */
export type Blocco = {
  nome: string;
  /** 0..1, oppure `null` se nessuna variabile del blocco era disponibile. */
  valore: number | null;
  /** Quota del peso del blocco effettivamente coperta dai dati (0..1). */
  copertura: number;
  variabili: VariabileScore[];
};

export type VariabileScore = {
  nome: string;
  etichetta: string;
  peso: number;
  /** Valore grezzo (unità naturali) oppure `null` se manca. */
  grezzo: number | null;
  /** Valore normalizzato 0..1 oppure `null` se manca. */
  normalizzato: number | null;
  unita: string | null;
  /** Da dove viene, in chiaro, per l'audit. */
  provenienza: string;
};

export type Punteggio = {
  /** 0..100, oppure `null` quando la copertura è sotto la soglia. */
  valore: number | null;
  /** 0..1: quota dei pesi totali coperta dai dati disponibili. */
  copertura: number;
  /** Testo mostrato quando `valore` è `null`. */
  esito: string | null;
  blocchi: Blocco[];
};

/** Risultato di un event study su una finestra. */
export type Finestra = {
  etichetta: string;
  da: number;
  a: number;
  /** Rendimento cumulato anomalo (frazione, es. 0.031 = +3,1%). */
  car: number | null;
  /** Rendimento grezzo cumulato nella stessa finestra. */
  grezzo: number | null;
  /** Rendimento del benchmark nella stessa finestra. */
  benchmark: number | null;
  giorniUsati: number;
};

export type EventStudy = {
  eventoId: string;
  /** Simbolo del benchmark usato per il market model. */
  benchmark: string;
  /** Alpha e beta stimati sulla finestra [-250,-30]. */
  alpha: number | null;
  beta: number | null;
  osservazioniStima: number;
  finestre: Finestra[];
  /** Motivo per cui lo studio non è calcolabile, se lo è. */
  problema: string | null;
};

export type StatoFonte = {
  nome: string;
  descrizione: string;
  url: string;
  /** Ultimo esito reale del download. */
  esito: "ok" | "errore" | "mai-provata";
  messaggio: string | null;
  aggiornataIl: string | null;
  /** Righe/record ottenuti nell'ultimo giro. */
  record: number | null;
};

export type Istantanea = {
  /** Quando il giro di aggiornamento è stato eseguito (ISO datetime). */
  generataIl: string;
  fonti: StatoFonte[];
};

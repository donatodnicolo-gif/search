// Motore di calcolo finanziario Deluxy Partner.
// Replica (e sostituisce) le formule del foglio PARTNER.xlsx:
//   commissione        = incasso vendite x fee%
//   dovuto al partner  = incasso - commissione x (1 + IVA)   ["Importo Incassi netto Commissioni"]
//
// Due regimi, in base al flag "Compensazione" del partner (colonna dell'Excel:
// "se i crediti per servizi vengono compensati dagli incassi per vendite"):
//
//   CON compensazione  -> un unico saldo netto per mese, come "SALDO IN COMPENSAZIONE":
//                         saldo = servizi fatturati IVATI - dovuto vendite (+ extra)
//                         residuo = saldo + bonifici registrati
//
//   SENZA compensazione -> due partite separate, mai compensate tra loro
//                         ("Credito da Saldare" / "Debito da Saldare" dell'Excel):
//                         da incassare = fatture non saldate (IVATE), meno eventuali acconti ricevuti
//                         da bonificare = dovuto vendite (+ extra), meno i bonifici gia' inviati
//
// Convenzione bonifici: importo > 0 = inviato al partner, < 0 = ricevuto dal partner.

export const IVA_DEFAULT = 22;

export type FatturaLike = {
  imponibile: number;
  aliquotaIva: number;
  pagata: boolean;
};

export type VenditaLike = {
  incassoLordo: number;
  feePercent: number;
};

export type SaldoLike = {
  aggiunte: number;
  detrazioni: number;
  bonificoImporto: number | null;
} | null | undefined;

export function commissione(v: VenditaLike): number {
  return (v.incassoLordo * v.feePercent) / 100;
}

// Quanto dovuto al partner per una vendita, tolta la commissione IVATA
export function dovutoVendita(v: VenditaLike): number {
  return v.incassoLordo - commissione(v) * (1 + IVA_DEFAULT / 100);
}

export function ivato(f: FatturaLike): number {
  return f.imponibile * (1 + f.aliquotaIva / 100);
}

export type RiepilogoMese = {
  compensazione: boolean;
  serviziNetto: number; // imponibile fatture servizi
  serviziIvato: number;
  serviziNonPagati: number; // ivato delle fatture non saldate
  vendite: number; // incasso lordo vendite come vendor
  commissioni: number; // netto IVA
  dovutoVendite: number; // dovuto al partner (netto commissioni ivate)
  aggiunte: number;
  detrazioni: number;
  dovutoPartner: number; // dovutoVendite + aggiunte - detrazioni
  bonifico: number; // netto registrato (>0 inviato, <0 ricevuto)
  bonificoInviato: number; // >= 0
  bonificoRicevuto: number; // >= 0 (valore assoluto degli incassi)
  saldo: number; // servizi IVATI - dovuto al partner (netto: significativo con compensazione)
  daIncassare: number; // >= 0: quanto il partner deve a Deluxy
  daBonificare: number; // >= 0: quanto Deluxy deve al partner
  residuo: number; // daIncassare - daBonificare (netto, per colonne e ordinamenti)
  pareggiato: boolean;
};

const positivo = (v: number) => (v > 0.005 ? v : 0);

export function riepilogoMese(
  fatture: FatturaLike[],
  vendite: VenditaLike[],
  saldoMese: SaldoLike,
  compensazione: boolean
): RiepilogoMese {
  const serviziNetto = fatture.reduce((a, f) => a + f.imponibile, 0);
  const serviziIvato = fatture.reduce((a, f) => a + ivato(f), 0);
  const serviziNonPagati = fatture.filter((f) => !f.pagata).reduce((a, f) => a + ivato(f), 0);
  const venditeTot = vendite.reduce((a, v) => a + v.incassoLordo, 0);
  const commissioniTot = vendite.reduce((a, v) => a + commissione(v), 0);
  const dovutoVenditeTot = vendite.reduce((a, v) => a + dovutoVendita(v), 0);
  const aggiunte = saldoMese?.aggiunte ?? 0;
  const detrazioni = saldoMese?.detrazioni ?? 0;
  const dovutoPartner = dovutoVenditeTot + aggiunte - detrazioni;
  const bonifico = saldoMese?.bonificoImporto ?? 0;
  const bonificoInviato = bonifico > 0 ? bonifico : 0;
  const bonificoRicevuto = bonifico < 0 ? -bonifico : 0;
  const saldo = serviziIvato - dovutoPartner;

  let daIncassare: number;
  let daBonificare: number;
  if (compensazione) {
    // partite compensate: conta solo il netto del mese
    const residuoNetto = saldo + bonifico;
    daIncassare = positivo(residuoNetto);
    daBonificare = positivo(-residuoNetto);
  } else {
    // partite separate: le fatture si saldano da sole, il dovuto vendite col bonifico
    daIncassare = positivo(serviziNonPagati - bonificoRicevuto);
    daBonificare = positivo(dovutoPartner - bonificoInviato);
  }

  return {
    compensazione,
    serviziNetto,
    serviziIvato,
    serviziNonPagati,
    vendite: venditeTot,
    commissioni: commissioniTot,
    dovutoVendite: dovutoVenditeTot,
    aggiunte,
    detrazioni,
    dovutoPartner,
    bonifico,
    bonificoInviato,
    bonificoRicevuto,
    saldo,
    daIncassare,
    daBonificare,
    residuo: daIncassare - daBonificare,
    pareggiato: daIncassare < 0.01 && daBonificare < 0.01,
  };
}

// Rolling annuale (colonne "Rolling ..." del foglio): cumulati year-to-date
export type Rolling = {
  fatture: number; // servizi fatturati netto IVA
  vendite: number;
  commissioni: number;
  incassiNettoCommissioni: number; // dovuto ai partner
  pagatoAlPartner: number; // bonifici inviati
  incassatoDalPartner: number; // bonifici/incassi ricevuti
  daIncassare: number; // >= 0 cumulato
  daBonificare: number; // >= 0 cumulato
  residuo: number; // daIncassare - daBonificare
  stimaChiusura: number; // run-rate su 12 mesi (vendite + servizi)
};

export function rolling(mesi: RiepilogoMese[]): Rolling {
  const sum = (fn: (m: RiepilogoMese) => number) => mesi.reduce((a, m) => a + fn(m), 0);
  const fatture = sum((m) => m.serviziNetto);
  const vendite = sum((m) => m.vendite);
  const mesiAttivi = mesi.filter((m) => m.vendite !== 0 || m.serviziNetto !== 0).length;
  const base = vendite + fatture;
  const daIncassare = sum((m) => m.daIncassare);
  const daBonificare = sum((m) => m.daBonificare);
  return {
    fatture,
    vendite,
    commissioni: sum((m) => m.commissioni),
    incassiNettoCommissioni: sum((m) => m.dovutoPartner),
    pagatoAlPartner: sum((m) => m.bonificoInviato),
    incassatoDalPartner: sum((m) => m.bonificoRicevuto),
    daIncassare,
    daBonificare,
    residuo: daIncassare - daBonificare,
    stimaChiusura: mesiAttivi > 0 ? (base / mesiAttivi) * 12 : 0,
  };
}

export const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export function nomeMese(m: number): string {
  return MESI[m - 1] ?? String(m);
}

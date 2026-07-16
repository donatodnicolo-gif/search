// Motore di calcolo finanziario Deluxy Partner.
// Replica (e sostituisce) le formule del foglio PARTNER.xlsx:
//   commissione        = incasso vendite x fee%
//   dovuto al partner  = incasso - commissione x (1 + IVA)   ["Importo Incassi netto Commissioni"]
//   saldo compensazione = servizi fatturati IVATI - dovuto vendite (+ extra)
//   residuo            = saldo + bonifici registrati (bonifico >0 inviato, <0 ricevuto)

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
  serviziNetto: number; // imponibile fatture servizi
  serviziIvato: number;
  serviziNonPagati: number; // ivato delle fatture non saldate
  vendite: number; // incasso lordo vendite come vendor
  commissioni: number; // netto IVA
  dovutoVendite: number; // dovuto al partner (netto commissioni ivate)
  aggiunte: number;
  detrazioni: number;
  dovutoPartner: number; // dovutoVendite + aggiunte - detrazioni
  saldo: number; // >0 il partner deve a Deluxy, <0 Deluxy deve al partner
  bonifico: number; // registrato (>0 inviato al partner, <0 ricevuto)
  residuo: number; // saldo + bonifico: 0 = mese pareggiato
};

export function riepilogoMese(
  fatture: FatturaLike[],
  vendite: VenditaLike[],
  saldoMese: SaldoLike
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
  const saldo = serviziIvato - dovutoPartner;
  const bonifico = saldoMese?.bonificoImporto ?? 0;
  const residuo = saldo + bonifico;
  return {
    serviziNetto,
    serviziIvato,
    serviziNonPagati,
    vendite: venditeTot,
    commissioni: commissioniTot,
    dovutoVendite: dovutoVenditeTot,
    aggiunte,
    detrazioni,
    dovutoPartner,
    saldo,
    bonifico,
    residuo,
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
  residuo: number; // somma dei residui mensili
  stimaChiusura: number; // run-rate su 12 mesi (vendite + servizi)
};

export function rolling(mesi: RiepilogoMese[]): Rolling {
  const sum = (fn: (m: RiepilogoMese) => number) => mesi.reduce((a, m) => a + fn(m), 0);
  const fatture = sum((m) => m.serviziNetto);
  const vendite = sum((m) => m.vendite);
  const mesiAttivi = mesi.filter((m) => m.vendite !== 0 || m.serviziNetto !== 0).length;
  const base = vendite + fatture;
  return {
    fatture,
    vendite,
    commissioni: sum((m) => m.commissioni),
    incassiNettoCommissioni: sum((m) => m.dovutoPartner),
    pagatoAlPartner: sum((m) => (m.bonifico > 0 ? m.bonifico : 0)),
    incassatoDalPartner: sum((m) => (m.bonifico < 0 ? -m.bonifico : 0)),
    residuo: sum((m) => m.residuo),
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

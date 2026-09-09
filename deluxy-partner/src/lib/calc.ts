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
  // incasso parziale già ricevuto (IVA inclusa); assente = 0 per i dati vecchi
  incassato?: number | null;
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

// Quanto già incassato su una fattura, IVA inclusa (0 per i dati senza il campo).
export function incassatoFattura(f: FatturaLike): number {
  return f.incassato ?? 0;
}

// Residuo ancora da incassare su una fattura (IVA inclusa): 0 se saldata,
// altrimenti totale IVATO meno l'eventuale incasso parziale. Mai negativo.
export function residuoFattura(f: FatturaLike): number {
  if (f.pagata) return 0;
  const r = ivato(f) - incassatoFattura(f);
  return r > 0.005 ? r : 0;
}

// true se la fattura ha un incasso parziale ma non è ancora saldata.
export function parzialmenteIncassata(f: FatturaLike): boolean {
  return !f.pagata && incassatoFattura(f) > 0.005;
}

export type RiepilogoMese = {
  compensazione: boolean;
  serviziNetto: number; // imponibile fatture servizi
  serviziIvato: number;
  serviziNonPagati: number; // RESIDUO da incassare delle fatture non saldate (IVATO − incassi parziali)
  serviziNonPagatiNetto: number; // lo stesso residuo al NETTO dell'IVA (per mostrare «imponibile +IVA → ivato»)
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
  // Il dovuto su cui si misura il bonifico: di norma `dovutoPartner`, ma dove
  // l'extra è importato e un bonifico è uscito vale il solo dovuto vendite.
  dovutoEffettivo: number;
  extraSospetto: boolean; // le aggiunte del mese non sono un dovuto: sono lo sforo
  // Lo SFORO, che `daIncassare`/`daBonificare` non possono dire perché sono
  // troncati a zero (08/09/2026, regola dell'utente). >= 0, e solo per le
  // partite separate: in compensazione il netto del mese lo dice già da sé.
  pagatoInPiu: number; // abbiamo bonificato PIÙ del dovuto: differenza in più
  incassatoInPiu: number; // il partner ha pagato PIÙ delle sue fatture aperte
  // ⭐ Regime «commissioni a parte» (compensazione decisa NO sulla piattaforma):
  // il dovuto è il venduto PIENO e la commissione IVATA diventa un credito.
  commissioniAParte: boolean;
  commissioniDaIncassare: number; // >= 0: la commissione IVATA che il partner deve
  residuo: number; // daIncassare - daBonificare (netto, per colonne e ordinamenti)
  pareggiato: boolean;
};

const positivo = (v: number) => (v > 0.005 ? v : 0);

export function riepilogoMese(
  fatture: FatturaLike[],
  vendite: VenditaLike[],
  saldoMese: SaldoLike,
  compensazione: boolean,
  /** Il mese ha voci in `ExtraSaldo`, cioè extra scritti da una persona con la
   *  loro descrizione. Se no, le `aggiunte` sul saldo vengono dall'import di
   *  PARTNER.xlsx e non hanno una causale: vedi sotto. Default `true` = non
   *  riclassificare, così un chiamante che non lo sa non cambia i conti. */
  extraRegistrati: boolean = true,
  /**
   * ⭐ 09/09/2026 — REGIME «COMMISSIONI A PARTE», regola dell'utente:
   * «senza compensazione il dovuto è pari al venduto e si apre una nuova riga
   * per mese con il valore della fattura delle commissioni che il partner dovrà
   * pagare».
   *
   * ⚠️ Vale SOLO per chi ha la compensazione **decisa a NO** sulla piattaforma
   * («è solo per chi ha compensazione valorizzata come no»), non per chi non
   * l'ha mai valorizzata. Sono tre risposte, non due: `null` = «ancora da
   * valorizzare» e il mese resta come prima (dovuto già al netto). Confondere
   * «non deciso» con «no» qui vorrebbe dire spostare 113.561,48 € di
   * commissioni su 107 partner che nessuno ha mai interrogato.
   */
  commissioniAParte: boolean = false
): RiepilogoMese {
  const serviziNetto = fatture.reduce((a, f) => a + f.imponibile, 0);
  const serviziIvato = fatture.reduce((a, f) => a + ivato(f), 0);
  // Residuo da incassare: conta solo la parte NON ancora incassata delle fatture
  // aperte (con i saldi parziali, non tutto il totale IVATO).
  const serviziNonPagati = fatture.reduce((a, f) => a + residuoFattura(f), 0);
  // Il netto del residuo: si scorpora l'IVA fattura per fattura, così le
  // aliquote diverse restano corrette (residuo / (1 + aliquota)).
  const serviziNonPagatiNetto = fatture.reduce(
    (a, f) => a + residuoFattura(f) / (1 + f.aliquotaIva / 100),
    0
  );
  const venditeTot = vendite.reduce((a, v) => a + v.incassoLordo, 0);
  const commissioniTot = vendite.reduce((a, v) => a + commissione(v), 0);
  // Col regime «commissioni a parte» il dovuto al partner è il venduto PIENO:
  // la commissione non si scala qui, si fattura e si incassa a parte.
  const dovutoVenditeTot = commissioniAParte
    ? venditeTot
    : vendite.reduce((a, v) => a + dovutoVendita(v), 0);
  const aggiunte = saldoMese?.aggiunte ?? 0;
  const detrazioni = saldoMese?.detrazioni ?? 0;
  const dovutoPartner = dovutoVenditeTot + aggiunte - detrazioni;
  const bonifico = saldoMese?.bonificoImporto ?? 0;
  const bonificoInviato = bonifico > 0 ? bonifico : 0;
  const bonificoRicevuto = bonifico < 0 ? -bonifico : 0;
  const saldo = serviziIvato - dovutoPartner;

  // ⚠️ L'EXTRA IMPORTATO NON È UN DOVUTO — ma SOLO dove un bonifico è davvero
  // uscito (regola dell'utente, 08/09/2026). Le `aggiunte` arrivate da
  // PARTNER.xlsx non hanno né descrizione né riga in `ExtraSaldo`: sono 211
  // mesi per 82.681,70 €. Dove un bonifico c'è, l'utente le legge per quello
  // che sono — la differenza fra quanto si doveva e quanto è uscito, cioè soldi
  // mandati per errore — e allora il dovuto vero è quello delle sole vendite.
  // Dove il bonifico NON c'è non esiste nessuna prova di un errore, e l'extra
  // resta un dovuto: così la riclassificazione tocca 31 mesi, non 211.
  const extraSospetto = !extraRegistrati && aggiunte > 0.005 && bonificoInviato > 0.005;
  const dovutoEffettivo = extraSospetto ? dovutoVenditeTot - detrazioni : dovutoPartner;

  // La commissione IVATA che il partner deve, quando non si compensa per scelta
  // esplicita. È lo stesso numero che va sulla fattura commissioni emessa su
  // Fatture in Cloud (`fic-actions.ts` fattura `riepilogo.commissioni`): qui non
  // si inventa un importo, si dice quello che quella fattura porta.
  // ⚠️ Se la fattura commissioni fosse ANCHE fra le fatture servizi del mese,
  // il credito verrebbe contato due volte. È il difetto trovato l'08/09 su
  // 142 RESTAURANT (la 460/2026 registrata come servizio): chi costruisce la
  // lista delle fatture deve tenerla fuori.
  const commissioniDaIncassare = commissioniAParte ? commissioniTot * (1 + IVA_DEFAULT / 100) : 0;
  const creditiMese = serviziNonPagati + commissioniDaIncassare;

  let daIncassare: number;
  let daBonificare: number;
  if (compensazione) {
    // partite compensate: conta solo il netto del mese
    const residuoNetto = saldo + bonifico;
    daIncassare = positivo(residuoNetto);
    daBonificare = positivo(-residuoNetto);
  } else {
    // partite separate: le fatture (e le commissioni, dove sono a parte) si
    // saldano da sole, il dovuto vendite col bonifico
    daIncassare = positivo(creditiMese - bonificoRicevuto);
    daBonificare = positivo(dovutoEffettivo - bonificoInviato);
  }

  // ⭐ 08/09/2026 (regola dell'utente): «se abbiamo pagato in più segna quanto
  // la differenza come un più, idem se abbiamo pagato in meno» — e «se annullo
  // il bonifico anche questo plus o minus deve scomparire».
  //
  // `positivo()` tronca a zero, quindi lo SFORO spariva: un mese con dovuto
  // 114,38 € e bonificato 114,39 € si leggeva «da bonificare 0,00 €, mese
  // pareggiato». Il troncamento è giusto per «quanto resta da fare» — non si
  // sollecita un numero negativo — ma la differenza va detta col suo segno.
  //
  // ⚠️ SI CALCOLA, NON SI MEMORIZZA: nasce da `bonificoImporto`, quindi
  // annullando il bonifico torna zero da sé. Nessuna riga da cancellare, nessun
  // numero che sopravvive alla causa che l'ha prodotto (regola d'oro n.1).
  //
  // ⚠️ L'EXTRA IMPORTATO NON È UN DOVUTO, ma SOLO dove un bonifico è davvero
  // uscito (regola dell'utente, 08/09). Le `aggiunte` arrivate da PARTNER.xlsx
  // non hanno descrizione né riga in `ExtraSaldo`: 211 mesi, 82.681,70 €. Dove
  // un bonifico c'è, l'utente le legge come la differenza fra dovuto e pagato —
  // cioè soldi usciti per errore — e allora il dovuto vero è quello delle sole
  // vendite. Dove il bonifico NON c'è non esiste nessuna prova di un errore, e
  // l'extra resta un dovuto com'era: la riclassificazione tocca 31 mesi, non 211.
  const pagatoInPiu = compensazione ? 0 : positivo(bonificoInviato - dovutoEffettivo);
  const incassatoInPiu = compensazione ? 0 : positivo(bonificoRicevuto - creditiMese);

  return {
    compensazione,
    serviziNetto,
    serviziIvato,
    serviziNonPagati,
    serviziNonPagatiNetto,
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
    dovutoEffettivo,
    extraSospetto,
    pagatoInPiu,
    incassatoInPiu,
    commissioniAParte,
    commissioniDaIncassare,
    residuo: daIncassare - daBonificare,
    // ⚠️ Un mese con uno SFORO non è «pareggiato»: c'è una differenza da
    // guardare, anche se non c'è più niente da fare. Dirlo pareggiato è come
    // dire che i conti tornano quando invece avanza (o manca) del denaro.
    pareggiato: daIncassare < 0.01 && daBonificare < 0.01 && pagatoInPiu < 0.01 && incassatoInPiu < 0.01,
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
  // ⚠️ Già AL NETTO di quello che è uscito in più (08/09/2026): il credito si
  // recupera trattenendolo dai prossimi bonifici, quindi qui è già scalato.
  daBonificare: number; // >= 0 cumulato, netto del surplus
  inviatoInPiu: number; // >= 0: quanto è uscito oltre il dovuto, nell'anno
  // Il surplus che AVANZA dopo aver scalato tutto il dovuto: denaro nostro che
  // sta dal partner e che i mesi successivi devono ancora riassorbire.
  surplusDaRecuperare: number;
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
  const daBonificareLordo = sum((m) => m.daBonificare);
  // ⭐ 08/09/2026 (regola dell'utente): «quindi andrebbero scalati dai prossimi
  // pagamenti». Quello che è uscito in più è un CREDITO verso il partner: si
  // recupera trattenendolo dai bonifici successivi, non chiedendoglielo indietro.
  // Qui si somma sull'anno e si sottrae da quello che gli resta da versare.
  const inviatoInPiu = sum((m) => m.pagatoInPiu);
  const daBonificare = positivo(daBonificareLordo - inviatoInPiu);
  // Se il credito è più grande di quello che gli dobbiamo ancora, l'eccedenza
  // resta lì e si porta avanti: è denaro nostro che sta dal partner.
  const surplusDaRecuperare = positivo(inviatoInPiu - daBonificareLordo);
  return {
    fatture,
    vendite,
    commissioni: sum((m) => m.commissioni),
    incassiNettoCommissioni: sum((m) => m.dovutoPartner),
    pagatoAlPartner: sum((m) => m.bonificoInviato),
    incassatoDalPartner: sum((m) => m.bonificoRicevuto),
    daIncassare,
    daBonificare,
    inviatoInPiu,
    surplusDaRecuperare,
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

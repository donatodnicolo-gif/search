// L'ordine con cui si esportano e si importano le tabelle: prima quelle
// indipendenti, poi quelle che le referenziano (le chiavi esterne devono
// trovare la riga già presente).
//
// Sta in un file suo perché sia esporta-dati.mjs sia importa-dati.mjs lo
// leggono: se stesse dentro uno dei due, importarlo ne eseguirebbe il codice.
export const ORDINE_TABELLE = [
  "analisi",
  "landingPage",
  "campagna",
  "azione",
  "eventoAzione",
  "metricaCampagna",
  "metricaLanding",
  "landingScorecard",
  "documentoDrive",
  "apiKey",
  "venditaMensile",
  "budgetMensile",
  "settimanaMkt",
  "copyAnnuncio",
  "copyScore",
  "testMeta",
  "pubblico",
  "misuraPubblico",
  "ordine",
  "rigaOrdine",
  "impostazione",
  "accountAdv",
  "alert",
  "incidente",
  "modifica",
  "memoriaVoce",
  "incongruenza",
  "cadenza",
  "cadenzaOccorrenza",
  "occasione",
  "creativo",
  "operazioneAdv",
  "registroEvento",
];

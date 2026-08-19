// Prova a secco dello script di Google Ads: lo esegue con AdsApp finto, per
// prendere gli errori di codice (ReferenceError, funzioni senza parametro,
// query malformate) SENZA doverli scoprire dal log dentro Google Ads.
//
//   node scripts/prova-script-google.mjs
//
// ⚠️ Non tocca niente: né Google né l'app. Ogni chiamata di rete è finta e
// ogni query restituisce un risultato vuoto — quello che si verifica è che
// il codice giri, non che i dati siano giusti.
//
// Nato l'11/08/2026, dopo che `leggiDestinazioni()` è finita in produzione
// usando `conto` senza riceverlo: il giro `copy` moriva con
// «ReferenceError: conto is not defined» e l'abbiamo scoperto dal log di
// Flowers, un giorno dopo.
import fs from "node:fs";
import vm from "node:vm";

const sorgente = fs.readFileSync(
  new URL("./google-ads-script.js", import.meta.url),
  "latin1"
);

const righeQuery = [];
const risultatoVuoto = () => ({ hasNext: () => false, next: () => ({}), totalNumEntities: () => 0 });

// ⚠️ UNA riga finta per query, non zero. Con le query vuote il codice non
// entra nei cicli e non tocca mai le variabili di dentro: la prima versione
// di questa prova dichiarava «tutto ok» sullo stesso identico bug che aveva
// rotto il giro `copy` in produzione. Una prova che non entra nel corpo del
// ciclo non prova niente.
const rigaFinta = () => ({
  campaign: { id: "111", name: "[Prova] Campagna", status: "ENABLED", advertisingChannelType: "SEARCH", biddingStrategyType: "MAXIMIZE_CONVERSIONS" },
  campaignBudget: { amountMicros: 15000000 },
  adGroup: { id: "222", name: "Gruppo di prova", status: "ENABLED" },
  adGroupAd: { status: "ENABLED", ad: { id: "333", finalUrls: ["https://esempio.it/pagina"] }, policySummary: { approvalStatus: "APPROVED", reviewStatus: "REVIEWED" } },
  adGroupCriterion: { criterionId: "444", negative: false, status: "ENABLED", keyword: { text: "parola di prova", matchType: "EXACT" }, qualityInfo: { qualityScore: 7 } },
  adGroupAdAssetView: { fieldType: "HEADLINE", performanceLabel: "GOOD", enabled: true },
  asset: { id: "555", textAsset: { text: "Titolo di prova" }, name: "asset", sitelinkAsset: { linkText: "Vai" }, imageAsset: { fullSize: { url: "https://esempio.it/i.jpg" } } },
  campaignCriterion: { criterionId: "666", displayName: "Milan", type: "LOCATION", negative: false, bidModifier: 1.2, status: "ENABLED" },
  geoTargetConstant: { id: "666", name: "Milan", canonicalName: "Milan,Italy", targetType: "City" },
  searchTermView: { searchTerm: "ricerca di prova", status: "NONE" },
  segments: { date: "2026-08-11", device: "MOBILE", dayOfWeek: "MONDAY", adNetworkType: "SEARCH", keyword: { info: { text: "parola", matchType: "EXACT" }, adGroupCriterion: "customers/1/adGroupCriteria/222~444" } },
  metrics: { costMicros: 1230000, impressions: 100, clicks: 10, conversions: 2, conversionsValue: 90, searchImpressionShare: 0.5, searchBudgetLostImpressionShare: 0.1, searchRankLostImpressionShare: 0.2 },
  customer: { id: "1", descriptiveName: "Prova" },
});
const risultatoConUnaRiga = () => {
  let dato = false;
  return {
    hasNext: () => !dato,
    next: () => {
      dato = true;
      return rigaFinta();
    },
    totalNumEntities: () => 1,
  };
};

const registro = [];
const righeCaricamento = [];
const colonneCaricamento = [];

// La campagna finta su cui si prova il SECONDO TEMPO (gruppo, keyword,
// annuncio, località). Ogni costruttore risponde «riuscito» e ogni elenco è
// vuoto, così il codice entra in tutti i rami che creano davvero qualcosa.
const operazioneOk = (risultato) => ({
  isSuccessful: () => true,
  getResult: () => risultato,
  getErrors: () => [],
});
const gruppoFinto = {
  getName: () => "Gruppo di prova",
  getId: () => "222",
  keywords: () => ({ get: () => risultatoVuoto() }),
  ads: () => ({ get: () => risultatoVuoto() }),
  newKeywordBuilder: () => ({ withText: () => ({ build: () => operazioneOk({}) }) }),
  newAd: () => ({
    responsiveSearchAdBuilder: () => {
      const b = {
        withHeadlines: () => b,
        withDescriptions: () => b,
        withFinalUrl: () => b,
        build: () => operazioneOk({}),
      };
      return b;
    },
  }),
};
const campagnaFinta = {
  getId: () => "111",
  getName: () => "[Prova] Campagna",
  isEnabled: () => true,
  isPaused: () => false,
  pause: () => {},
  enable: () => {},
  getBudget: () => ({ getAmount: () => 15, setAmount: () => {} }),
  adGroups: () => ({ withCondition: () => ({ get: () => risultatoVuoto() }), get: () => risultatoVuoto() }),
  newAdGroupBuilder: () => ({ withName: () => ({ build: () => operazioneOk(gruppoFinto) }) }),
  addLocation: () => operazioneOk({}),
  targeting: () => ({ targetedLocations: () => ({ get: () => risultatoVuoto() }) }),
  createNegativeKeyword: () => {},
  negativeKeywords: () => ({ get: () => risultatoVuoto() }),
};

const contesto = {
  Logger: { log: (m) => registro.push(String(m)) },
  AdsApp: {
    search: (q) => {
      righeQuery.push(String(q).slice(0, 60));
      return risultatoConUnaRiga();
    },
    currentAccount: () => ({ getCustomerId: () => "000-000-0000", getName: () => "Prova" }),
    keywords: () => ({ withIds: () => ({ get: risultatoVuoto }), withCondition: () => ({ get: risultatoVuoto }) }),
    adGroups: () => ({ withIds: () => ({ get: risultatoVuoto }), withCondition: () => ({ get: risultatoVuoto }) }),
    campaigns: () => ({ withIds: () => ({ get: risultatoVuoto }), withCondition: () => ({ get: risultatoVuoto }) }),
    newCampaignBuilder: () => ({ withName: () => ({ build: () => ({ isSuccessful: () => false }) }) }),
    // ⚠️ Il bulk upload NON risponde nemmeno qui, come nella realtà: `apply()`
    // non restituisce niente. Serve solo a far girare il codice che lo compone.
    bulkUploads: () => ({
      newCsvUpload: (colonne) => {
        colonneCaricamento.push(colonne);
        return {
          forCampaignManagement: () => {},
          append: (riga) => righeCaricamento.push(riga),
          apply: () => {},
        };
      },
    }),
  },
  UrlFetchApp: {
    fetch: () => ({ getResponseCode: () => 200, getContentText: () => "{}" }),
  },
  Utilities: {
    formatDate: (d) => new Date(d).toISOString().slice(0, 10).replace(/-/g, ""),
    sleep: () => {},
  },
  JSON,
  Math,
  Date,
  String,
  Number,
  Object,
  Array,
  isNaN,
  encodeURIComponent,
  parseInt,
  parseFloat,
};

vm.createContext(contesto);
new vm.Script(sorgente).runInContext(contesto);

// I lavori del giro completo, uno per uno: quello che gira davvero dentro
// Google Ads. Un errore qui è un errore che finirebbe nel log di produzione.
const conto = { id: "825-518-1560", nome: "Prova", brand: "flowers" };
const lavori = [
  ["metriche", () => contesto.mandaMetriche(conto)],
  ["copy", () => contesto.mandaCopy(conto)],
  ["gruppi", () => contesto.mandaGruppi(conto)],
  ["asset", () => contesto.mandaAsset(conto)],
  ["diagnosi", () => contesto.mandaDiagnosi(conto)],
  ["approvazioni", () => contesto.mandaApprovazioni(conto)],
  ["stati-keyword", () => contesto.mandaStatiKeyword(conto)],
  ["keyword-giorni", () => contesto.mandaKeywordGiorni(conto)],
  ["esegui", () => contesto.eseguiOperazioni(conto)],
  // ⚠️⚠️ I DUE RAMI CHE SCRIVONO, provati per davvero. Fino al 19/08/2026
  // questa prova diceva «9 su 9» senza mai entrare in `creaCampagna` né in
  // `completaCampagna`: i lavori qui sopra LEGGONO, e `esegui` senza operazioni
  // in coda non applica niente. È la stessa lezione già scritta in cima —
  // «una prova con query vuote non prova niente» — applicata al ramo che scrive.
  // Trovato così, subito: dopo aver spostato le località in `completaCampagna`,
  // l'esito di `creaCampagna` usava ancora `geo`, che lì non esiste più.
  // ReferenceError in produzione, invisibile a tutto il resto.
  [
    "creaCampagna (secco)",
    () =>
      contesto.creaCampagna(
        {
          parametri: {
            nome: "[Prova] Campagna nuova",
            budget: 35,
            gruppo: "Gruppo di prova",
            strategia: "max_conversioni",
            lingua: "eng",
            keywords: [{ testo: "fiori milano", corrispondenza: "phrase" }],
            titoli: ["Uno", "Due", "Tre"],
            descrizioni: ["Descrizione uno", "Descrizione due"],
            finalUrl: "https://esempio.it/pagina",
            localitaId: [2380],
            localitaNomi: ["Costa Smeralda"],
          },
        },
        conto
      ),
  ],
  [
    "completaCampagna (secco)",
    () =>
      contesto.completaCampagna(
        {
          parametri: {
            gruppo: "Gruppo di prova",
            keywords: [{ testo: "fiori milano", corrispondenza: "phrase" }],
            titoli: ["Uno", "Due", "Tre"],
            descrizioni: ["Descrizione uno", "Descrizione due"],
            finalUrl: "https://esempio.it/pagina",
            localitaId: [2380, 2724],
            localitaNomi: ["Costa Smeralda"],
          },
        },
        { campagna: campagnaFinta }
      ),
  ],
];

let rotti = 0;
for (const [nome, esegui] of lavori) {
  try {
    esegui();
    console.log(`ok    ${nome}`);
  } catch (e) {
    rotti++;
    console.log(`ROTTO ${nome}: ${e}`);
  }
}
console.log(`\nquery preparate: ${righeQuery.length} · lavori rotti: ${rotti}`);
process.exitCode = rotti > 0 ? 1 : 0;

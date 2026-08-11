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

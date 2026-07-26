// Banco di prova del google-ads-script.js: finge Google Ads e l'app Deluxy,
// e controlla che lo script faccia davvero quello che dice.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const CODICE = fs.readFileSync(path.join(__dirname, "google-ads-script.js"), "utf8");

let esiti = [];
function verifica(nome, condizione, extra) {
  esiti.push({ nome, ok: !!condizione, extra });
}

function iteratore(righe) {
  let i = 0;
  return { hasNext: () => i < righe.length, next: () => righe[i++] };
}

function ambiente(opzioni) {
  const o = Object.assign({ anteprima: false, righeQuery: {}, rispostaApp: null, operazioni: [] }, opzioni);
  const inviati = [];
  const log = [];

  const sandbox = {
    Logger: { log: (m) => log.push(String(m)) },
    Utilities: { sleep: () => {} },
    AdsApp: {
      getExecutionInfo: () => ({ isPreview: () => o.anteprima }),
      currentAccount: () => ({
        getCustomerId: () => o.customerId || "248-656-1148",
        getName: () => "REGALI DELUXE",
        getCurrencyCode: () => o.valuta || "EUR",
        getTimeZone: () => "Europe/Rome",
      }),
      search: (q) => {
        for (const chiave in o.righeQuery) {
          if (q.indexOf(chiave) !== -1) return iteratore(o.righeQuery[chiave]);
        }
        return iteratore([]);
      },
      campaigns: () => o.selettoreCampagne || selettoreVuoto(),
      performanceMaxCampaigns: () => o.selettorePmax || selettoreVuoto(),
      shoppingCampaigns: () => selettoreVuoto(),
      videoCampaigns: () => selettoreVuoto(),
      keywords: () => o.selettoreKeyword || selettoreVuoto(),
    },
    UrlFetchApp: {
      fetch: (url, opts) => {
        const corpo = opts.payload ? JSON.parse(opts.payload) : null;
        inviati.push({ url, metodo: opts.method, corpo });
        const r = o.rispostaApp ? o.rispostaApp(url, corpo, inviati.length) : { codice: 201, testo: "{}" };
        return { getResponseCode: () => r.codice, getContentText: () => r.testo };
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(CODICE, sandbox);
  return { sandbox, inviati, log };
}

function selettoreVuoto() {
  const s = { withIds: () => s, withCondition: () => s, get: () => iteratore([]) };
  return s;
}

function selettoreCon(entita) {
  const s = { withIds: () => s, withCondition: () => s, get: () => iteratore(entita) };
  return s;
}

// ───────────────────────── 1. metriche ─────────────────────────
{
  const { sandbox, inviati } = ambiente({
    righeQuery: {
      "FROM campaign ": [
        {
          campaign: { id: 111, name: "DC1 Fiori Milano ENG", status: "ENABLED", advertisingChannelType: "SEARCH", biddingStrategyType: "TARGET_ROAS" },
          campaignBudget: { amountMicros: 20000000 },
          segments: { date: "2026-07-25" },
          metrics: { costMicros: 12345678, impressions: 900, clicks: 40, conversions: 2.5, conversionsValue: 310.5 },
        },
        {
          campaign: { id: 222, name: "DC12 Brand Protection", status: "PAUSED", advertisingChannelType: "SEARCH", biddingStrategyType: "TARGET_CPA" },
          campaignBudget: { amountMicros: 5000000 },
          segments: { date: "2026-07-25" },
          metrics: { costMicros: 0, impressions: 0, clicks: 0, conversions: 0, conversionsValue: 0 },
        },
      ],
    },
    rispostaApp: () => ({ codice: 201, testo: JSON.stringify({ metricheSalvate: 2, campagneCreate: 1, righeScartate: 0 }) }),
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.BRAND = "gifts";
  sandbox.AZIONE = "metriche";
  sandbox.main();

  const corpo = inviati[0].corpo;
  verifica("metriche: 1 sola chiamata", inviati.length === 1);
  verifica("metriche: canale/account/brand", corpo.canale === "google_ads" && corpo.account === "248-656-1148" && corpo.brand === "gifts");
  verifica("metriche: spesa da micro a euro", corpo.righe[0].spesa === 12.35, corpo.righe[0].spesa);
  verifica("metriche: budget da micro", corpo.righe[0].budgetGiornaliero === 20);
  verifica("metriche: PAUSED → in_pausa", corpo.righe[1].stato === "in_pausa");
  verifica("metriche: strategia offerta", corpo.righe[0].strategiaOfferta === "TARGET_ROAS");
}

// ───────────────────────── 2. keyword accorpate ─────────────────────────
{
  const kw = (gruppoId, gruppo, criterio, costo, impr, qs, stato) => ({
    campaign: { name: "DC1 Fiori Milano ENG" },
    adGroup: { id: gruppoId, name: gruppo },
    adGroupCriterion: {
      criterionId: criterio,
      keyword: { text: "fiori milano", matchType: "PHRASE" },
      status: stato || "ENABLED",
      qualityInfo: { qualityScore: qs },
    },
    metrics: { costMicros: costo * 1000000, impressions: impr, clicks: 10, conversions: 1, conversionsValue: 50 },
  });
  const { sandbox, inviati } = ambiente({
    righeQuery: {
      keyword_view: [kw(1, "Gruppo A", 999, 30, 100, 6), kw(2, "Gruppo B", 999, 70, 400, 8)],
    },
    rispostaApp: () => ({ codice: 201, testo: JSON.stringify({ keywords: { nuove: 1, aggiornate: 0 } }) }),
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.BRAND = "gifts";
  sandbox.AZIONE = "copy";
  sandbox.main();

  const k = inviati[0].corpo.keywords;
  verifica("keyword: due gruppi → una riga", k.length === 1, k.length);
  verifica("keyword: spesa sommata", k[0].spesa === 100, k[0].spesa);
  verifica("keyword: clic sommati", k[0].clic === 20);
  verifica("keyword: id col gruppo che spende di più", k[0].idEsterno === "248-656-1148:2:999", k[0].idEsterno);
  verifica("keyword: QS del gruppo con più impressioni", k[0].punteggioQualita === 8);
  verifica("keyword: gruppi elencati", k[0].gruppo === "Gruppo A, Gruppo B");
}

// ───────────────────────── 3. testi annunci ─────────────────────────
{
  const asset = (gruppo, testo, label, stato) => ({
    campaign: { name: "DC1 Fiori Milano ENG" },
    adGroup: { name: gruppo },
    asset: { textAsset: { text: testo } },
    adGroupAdAssetView: { fieldType: "HEADLINE", performanceLabel: label },
    adGroupAd: { status: stato || "ENABLED" },
  });
  const { sandbox, inviati } = ambiente({
    righeQuery: { ad_group_ad_asset_view: [asset("G1", "Consegna in 3 ore", "LOW"), asset("G2", "Consegna in 3 ore", "BEST")] },
    rispostaApp: () => ({ codice: 201, testo: "{}" }),
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.AZIONE = "copy";
  sandbox.main();

  const a = inviati[0].corpo.annunci;
  verifica("annunci: una riga per campagna+testo", a.length === 1, a.length);
  verifica("annunci: tiene il rendimento migliore", a[0].rendimento === "BEST", a[0].rendimento);
  verifica("annunci: conta gli usi", a[0].note === "usato in 2 annunci", a[0].note);
}

// ───────────────────────── 3-bis. gruppi di annunci ─────────────────────────
{
  const gruppo = (id, nome, campagna, costo, incasso, stato, tipo) => ({
    campaign: { name: campagna },
    adGroup: { id, name: nome, status: stato || "ENABLED", type: tipo || "SEARCH_STANDARD" },
    metrics: { costMicros: costo * 1000000, impressions: 1000, clicks: 50, conversions: 3, conversionsValue: incasso },
  });
  const gruppoAsset = (id, nome, campagna, costo, incasso) => ({
    campaign: { name: campagna },
    assetGroup: { id, name: nome, status: "ENABLED" },
    metrics: { costMicros: costo * 1000000, impressions: 500, clicks: 20, conversions: 1, conversionsValue: incasso },
  });
  const { sandbox, inviati } = ambiente({
    righeQuery: {
      "FROM ad_group ": [
        gruppo(10, "Gruppo debole", "DC1 Fiori Milano ENG", 40, 20),
        gruppo(11, "Gruppo forte", "DC1 Fiori Milano ENG", 100, 900, "PAUSED", "SEARCH_DYNAMIC_ADS"),
      ],
      "FROM asset_group ": [gruppoAsset(20, "Regali PMax", "DC9 Regali B2B", 60, 300)],
    },
    rispostaApp: () => ({ codice: 201, testo: JSON.stringify({ gruppi: { nuovi: 3, aggiornati: 0 } }) }),
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.BRAND = "gifts";
  sandbox.AZIONE = "gruppi";
  sandbox.main();

  const g = inviati[0].corpo.gruppi;
  verifica("gruppi: annunci + asset group insieme", g.length === 3, g.length);
  verifica("gruppi: ordinati per spesa", g[0].testo === "Gruppo forte" && g[0].spesa === 100, g[0].testo);
  verifica("gruppi: id con account", g[0].idEsterno === "248-656-1148:11", g[0].idEsterno);
  verifica("gruppi: incasso e conversioni per gruppo", g[0].incasso === 900 && g[0].conversioni === 3);
  verifica("gruppi: stato piattaforma vero", g[0].statoPiattaforma === "PAUSED", g[0].statoPiattaforma);
  verifica("gruppi: tipo non standard nelle note", g[0].note === "tipo search dynamic ads", g[0].note);
  verifica("gruppi: tipo standard senza nota", g.find((x) => x.testo === "Gruppo debole").note === null);
  const pmax = g.find((x) => x.testo === "Regali PMax");
  verifica("gruppi: PMax marcato come gruppo di asset", pmax && pmax.note === "gruppo di asset (Performance Max)");
  verifica("gruppi: id PMax distinto", pmax && pmax.idEsterno === "248-656-1148:ag:20", pmax && pmax.idEsterno);
}

// ───────────────────────── 3-ter. account senza PMax ─────────────────────────
{
  const { sandbox, inviati } = ambiente({
    righeQuery: {
      "FROM ad_group ": [
        {
          campaign: { name: "DC1" },
          adGroup: { id: 1, name: "Gruppo unico", status: "ENABLED", type: "SEARCH_STANDARD" },
          metrics: { costMicros: 1000000, impressions: 10, clicks: 1, conversions: 0, conversionsValue: 0 },
        },
      ],
      // la vista asset_group non risponde: non deve far saltare tutto
      "FROM asset_group ": null,
    },
    rispostaApp: () => ({ codice: 201, testo: "{}" }),
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.AZIONE = "gruppi";
  sandbox.main();
  verifica("gruppi: senza PMax manda comunque i gruppi di annunci", inviati.length === 1 && inviati[0].corpo.gruppi.length === 1);
}

// ───────────────────────── 4. asset su più livelli ─────────────────────────
{
  const sitelink = (vista, campagna, gruppo) => {
    const r = {
      asset: { id: 555, type: "SITELINK", sitelinkAsset: { linkText: "Consegna oggi", description1: "a Milano" }, finalUrls: ["https://deluxy.it/oggi"] },
    };
    if (campagna) r.campaign = { name: campagna };
    if (gruppo) r.adGroup = { name: gruppo };
    r[vista] = { status: "ENABLED" };
    return r;
  };
  const { sandbox, inviati } = ambiente({
    righeQuery: {
      "FROM customer_asset": [],
      "FROM campaign_asset": [sitelink("campaignAsset", "DC1 Fiori Milano ENG")],
      "FROM ad_group_asset": [sitelink("adGroupAsset", "DC1 Fiori Milano ENG", "Gruppo A")],
    },
    rispostaApp: () => ({ codice: 201, testo: "{}" }),
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.AZIONE = "asset";
  sandbox.main();

  const a = inviati[0].corpo.annunci;
  verifica("asset: due livelli → una riga", a.length === 1, a.length);
  verifica("asset: livelli accorpati", a[0].livello === "campagna + gruppo", a[0].livello);
  verifica("asset: id con account", a[0].idEsterno === "248-656-1148:555", a[0].idEsterno);
  verifica("asset: finalUrl conservato", a[0].finalUrl === "https://deluxy.it/oggi");
}

// ───────────────────────── 5. blocchi che si dimezzano ─────────────────────────
{
  const righe = [];
  for (let i = 0; i < 300; i++) {
    righe.push({
      campaign: { id: i, name: "C" + i, status: "ENABLED", advertisingChannelType: "SEARCH", biddingStrategyType: "TARGET_ROAS" },
      campaignBudget: { amountMicros: 1000000 },
      segments: { date: "2026-07-25" },
      metrics: { costMicros: 1000000, impressions: 1, clicks: 1, conversions: 0, conversionsValue: 0 },
    });
  }
  const { sandbox, inviati } = ambiente({
    righeQuery: { "FROM campaign ": righe },
    // L'app va in timeout sopra le 60 righe: lo script deve rimpicciolire i blocchi
    rispostaApp: (url, corpo) =>
      corpo.righe.length > 60
        ? { codice: 504, testo: "timeout" }
        : { codice: 201, testo: JSON.stringify({ metricheSalvate: corpo.righe.length }) },
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.AZIONE = "metriche";
  sandbox.main();

  const riuscite = inviati.filter((x) => x.corpo.righe.length <= 60);
  const totale = riuscite.reduce((s, x) => s + x.corpo.righe.length, 0);
  verifica("blocchi: tutte le 300 righe passano comunque", totale === 300, totale);
  verifica("blocchi: dimezza fino a stare nel limite", riuscite.every((x) => x.corpo.righe.length <= 60));
}

// ───────────────────────── 6. esecuzione operazioni ─────────────────────────
function campagnaFinta(stato) {
  const c = {
    _stato: stato,
    _budget: 20,
    getId: () => 111,
    isEnabled: () => c._stato === "attiva",
    isPaused: () => c._stato === "in_pausa",
    pause: () => { c._stato = "in_pausa"; },
    enable: () => { c._stato = "attiva"; },
    getBudget: () => ({ getAmount: () => c._budget, setAmount: (n) => { c._budget = n; } }),
  };
  return c;
}

// 6a. operazione di un altro account: si salta, NON si segna fallita
{
  const campagna = campagnaFinta("attiva");
  const { sandbox, inviati } = ambiente({
    selettoreCampagne: selettoreVuoto(), // la campagna non è in questo account
    rispostaApp: (url) =>
      url.indexOf("/api/v1/operazioni?") !== -1
        ? { codice: 200, testo: JSON.stringify({ operazioni: [{ id: "op1", tipo: "pausa_campagna", bersaglio: "[Cakedesign] (Sales) ITA", idEsterno: "999", parametri: {} }] }) }
        : { codice: 200, testo: "{}" },
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.BRAND = "gifts";
  sandbox.AZIONE = "esegui";
  sandbox.main();
  verifica("esegui: campagna di un altro account → nessun esito inviato", inviati.length === 1, inviati.length);
  verifica("esegui: campagna intatta", campagna._stato === "attiva");
}

// 6b. budget condiviso: rifiutato e segnato fallito
{
  const campagna = campagnaFinta("attiva");
  const { sandbox, inviati } = ambiente({
    selettoreCampagne: selettoreCon([campagna]),
    righeQuery: { explicitly_shared: [{ campaignBudget: { explicitlyShared: true } }] },
    rispostaApp: (url) =>
      url.indexOf("/api/v1/operazioni?") !== -1
        ? { codice: 200, testo: JSON.stringify({ operazioni: [{ id: "op2", tipo: "budget", bersaglio: "DC1", idEsterno: "111", account: "248-656-1148", parametri: { budget: 25 } }] }) }
        : { codice: 200, testo: "{}" },
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.BRAND = "gifts";
  sandbox.AZIONE = "esegui";
  sandbox.main();
  const esito = inviati.find((x) => x.url.indexOf("/esito") !== -1);
  verifica("budget condiviso: non toccato", campagna._budget === 20, campagna._budget);
  verifica("budget condiviso: fallimento riferito", esito && esito.corpo.riuscita === false, esito && esito.corpo.dettaglio);
}

// 6c. salto di budget oltre il limite: rifiutato
{
  const campagna = campagnaFinta("attiva");
  const { sandbox, inviati } = ambiente({
    selettoreCampagne: selettoreCon([campagna]),
    righeQuery: { explicitly_shared: [{ campaignBudget: { explicitlyShared: false } }] },
    rispostaApp: (url) =>
      url.indexOf("/api/v1/operazioni?") !== -1
        ? { codice: 200, testo: JSON.stringify({ operazioni: [{ id: "op3", tipo: "budget", bersaglio: "DC1", idEsterno: "111", account: "248-656-1148", parametri: { budget: 200 } }] }) }
        : { codice: 200, testo: "{}" },
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.BRAND = "gifts";
  sandbox.AZIONE = "esegui";
  sandbox.main();
  const esito = inviati.find((x) => x.url.indexOf("/esito") !== -1);
  verifica("budget ×10: rifiutato", campagna._budget === 20, campagna._budget);
  verifica("budget ×10: fallimento riferito", esito && esito.corpo.riuscita === false);
}

// 6d. budget normale: eseguito e riferito
{
  const campagna = campagnaFinta("attiva");
  const { sandbox, inviati } = ambiente({
    selettoreCampagne: selettoreCon([campagna]),
    righeQuery: { explicitly_shared: [{ campaignBudget: { explicitlyShared: false } }] },
    rispostaApp: (url) =>
      url.indexOf("/api/v1/operazioni?") !== -1
        ? { codice: 200, testo: JSON.stringify({ operazioni: [{ id: "op4", tipo: "budget", bersaglio: "DC1", idEsterno: "111", parametri: { budget: 24 } }] }) }
        : { codice: 200, testo: "{}" },
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.BRAND = "gifts";
  sandbox.AZIONE = "esegui";
  sandbox.main();
  const esito = inviati.find((x) => x.url.indexOf("/esito") !== -1);
  verifica("budget 20→24: applicato", campagna._budget === 24, campagna._budget);
  verifica("budget 20→24: esito riuscito", esito && esito.corpo.riuscita === true && /24/.test(esito.corpo.dettaglio));
}

// 6e. l'app non registra l'esito → ci si ferma alla prima operazione
{
  const campagna = campagnaFinta("attiva");
  const op = (id) => ({ id, tipo: "pausa_campagna", bersaglio: "DC1", idEsterno: "111", parametri: {} });
  const { sandbox, inviati, log } = ambiente({
    selettoreCampagne: selettoreCon([campagna, campagnaFinta("attiva")]),
    rispostaApp: (url) => {
      if (url.indexOf("/api/v1/operazioni?") !== -1) return { codice: 200, testo: JSON.stringify({ operazioni: [op("a"), op("b"), op("c")] }) };
      return { codice: 500, testo: "boom" }; // l'esito non viene registrato
    },
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.BRAND = "gifts";
  sandbox.AZIONE = "esegui";
  sandbox.main();
  const esiti2 = inviati.filter((x) => x.url.indexOf("/esito") !== -1);
  const idUnici = new Set(esiti2.map((x) => x.url.split("/operazioni/")[1].split("/")[0]));
  verifica("esito non registrato: si ferma alla prima operazione", idUnici.size === 1, [...idUnici].join(","));
  verifica("esito non registrato: avviso nel log", log.join("\n").indexOf("NON HA REGISTRATO") !== -1);
}

// ───────────────────────── 7. anteprima: non tocca niente ─────────────────────────
{
  const campagna = campagnaFinta("attiva");
  const { sandbox, inviati } = ambiente({
    anteprima: true,
    selettoreCampagne: selettoreCon([campagna]),
    righeQuery: {
      "FROM campaign ": [
        {
          campaign: { id: 1, name: "DC1", status: "ENABLED", advertisingChannelType: "SEARCH", biddingStrategyType: "TARGET_ROAS" },
          campaignBudget: { amountMicros: 1000000 },
          segments: { date: "2026-07-25" },
          metrics: { costMicros: 1000000, impressions: 1, clicks: 1, conversions: 0, conversionsValue: 0 },
        },
      ],
    },
    rispostaApp: (url) =>
      url.indexOf("/api/v1/operazioni?") !== -1
        ? { codice: 200, testo: JSON.stringify({ operazioni: [{ id: "op9", tipo: "pausa_campagna", bersaglio: "DC1", idEsterno: "1", parametri: {} }] }) }
        : { codice: 200, testo: "{}" },
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.BRAND = "gifts";
  sandbox.AZIONE = "tutto";
  sandbox.main();
  verifica("anteprima: nessun ingest inviato", inviati.filter((x) => x.url.indexOf("/ingest") !== -1).length === 0);
  verifica("anteprima: nessun esito inviato", inviati.filter((x) => x.url.indexOf("/esito") !== -1).length === 0);
  verifica("anteprima: campagna non messa in pausa", campagna._stato === "attiva");
}

// ───────────────────────── 8. valuta diversa da EUR: si ferma ─────────────────────────
{
  const { sandbox, inviati } = ambiente({ valuta: "USD", rispostaApp: () => ({ codice: 201, testo: "{}" }) });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.AZIONE = "metriche";
  sandbox.main();
  verifica("valuta USD: non manda nulla", inviati.length === 0);
}

// ───────────────────────── esito ─────────────────────────
let falliti = 0;
for (const e of esiti) {
  if (!e.ok) falliti++;
  console.log((e.ok ? "  OK  " : "  KO  ") + e.nome + (e.ok || e.extra === undefined ? "" : "  → " + e.extra));
}
console.log("\n" + (esiti.length - falliti) + "/" + esiti.length + " controlli superati");
process.exit(falliti ? 1 : 0);

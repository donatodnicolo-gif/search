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
  const tutte = []; // comprese le chiamate di servizio
  const anagrafiche = []; // l'elenco delle campagne: parte a ogni giro di metriche
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
        // `ricerca` decide guardando la query intera: serve a simulare un campo
        // che Google rifiuta (la quota impressioni non c'è su tutti gli account).
        if (o.ricerca) return iteratore(o.ricerca(q));
        for (const chiave in o.righeQuery) {
          if (q.indexOf(chiave) === -1) continue;
          const righe = o.righeQuery[chiave];
          // "errore" = la vista non risponde, come fa GAQL su un account che
          // non ha quel tipo di dato
          if (righe === "errore") throw new Error("vista non disponibile");
          return iteratore(righe);
        }
        return iteratore([]);
      },
      campaigns: () => o.selettoreCampagne || selettoreVuoto(),
      performanceMaxCampaigns: () => o.selettorePmax || selettoreVuoto(),
      shoppingCampaigns: () => selettoreVuoto(),
      videoCampaigns: () => selettoreVuoto(),
      keywords: () => o.selettoreKeyword || selettoreVuoto(),
      adGroups: () => o.selettoreGruppi || selettoreVuoto(),
    },
    UrlFetchApp: {
      fetch: (url, opts) => {
        const corpo = opts.payload ? JSON.parse(opts.payload) : null;
        const chiamata = { url, metodo: opts.method, corpo };
        tutte.push(chiamata);
        // Il sondaggio delle richieste "aggiorna adesso" parte a ogni giro:
        // resta in `tutte`, fuori da `inviati` che è il dato delle prove.
        if (url.indexOf("/api/v1/aggiornamenti") !== -1) {
          // sondaggio delle richieste: resta solo in `tutte`
        } else if (url.indexOf("/api/v1/ingest/campagne") !== -1) {
          anagrafiche.push(chiamata);
        } else {
          inviati.push(chiamata);
        }
        const r = o.rispostaApp ? o.rispostaApp(url, corpo, tutte.length) : { codice: 201, testo: "{}" };
        return { getResponseCode: () => r.codice, getContentText: () => r.testo };
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(CODICE, sandbox);
  return { sandbox, inviati, tutte, anagrafiche, log };
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
  const { sandbox, inviati, anagrafiche } = ambiente({
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
  verifica("metriche: 1 sola chiamata di metriche", inviati.length === 1);
  verifica("anagrafica: parte insieme alle metriche", anagrafiche.length === 1, anagrafiche.length);
  verifica("anagrafica: manda TUTTE le campagne, ferme comprese",
    anagrafiche[0].corpo.campagne.length === 2, anagrafiche[0].corpo.campagne.length);
  verifica("anagrafica: la ferma porta lo stato e nessuna metrica",
    anagrafiche[0].corpo.campagne[1].stato === "in_pausa" && anagrafiche[0].corpo.campagne[1].spesa === undefined);
  verifica("metriche: canale/account/brand", corpo.canale === "google_ads" && corpo.account === "248-656-1148" && corpo.brand === "gifts");
  verifica("metriche: spesa da micro a euro", corpo.righe[0].spesa === 12.35, corpo.righe[0].spesa);
  verifica("metriche: budget da micro", corpo.righe[0].budgetGiornaliero === 20);
  verifica("metriche: PAUSED → in_pausa", corpo.righe[1].stato === "in_pausa");
  verifica("metriche: strategia offerta", corpo.righe[0].strategiaOfferta === "TARGET_ROAS");
}

// ───────── 1-ter. l'ordine dei lavori e le richieste interrotte ─────────
{
  const sorgente = require("fs").readFileSync(__dirname + "/google-ads-script.js", "utf8");
  const inizio = sorgente.indexOf("var LAVORI_LETTURA");
  const lista = sorgente.slice(inizio, inizio + 160);
  const pos = (n) => lista.indexOf('"' + n + '"');
  verifica("ordine: i gruppi vengono PRIMA del copy", pos("gruppi") > 0 && pos("gruppi") < pos("copy"));
  verifica("ordine: il copy è dopo asset e diagnosi", pos("copy") > pos("asset") && pos("copy") > pos("diagnosi"));
  verifica("ordine: esegui è il primo del giro completo", sorgente.indexOf('["esegui"].concat(LAVORI_LETTURA)') !== -1);
  // Il punto della modifica: l'ordine deve esistere in UN posto solo. Due
  // liste che devono restare uguali prima o poi divergono — è già successo.
  verifica("ordine: le richieste dall'app usano LA STESSA lista",
    sorgente.indexOf('r.lavoro === "tutto" ? LAVORI_LETTURA') !== -1);
  verifica("ordine: non esiste una seconda lista scritta a mano",
    sorgente.indexOf('"metriche", "approvazioni", "copy"') === -1);
  verifica("richiesta interrotta: resta aperta invece di chiudersi", sorgente.indexOf("if (interrotto)") !== -1);
  verifica("copy: chiede solo le keyword con impressioni", sorgente.indexOf("metrics.impressions > 0") !== -1);
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

// ───────────── 3-bis. gruppi di annunci: una riga per giorno ─────────────
{
  const gruppo = (id, nome, giorno, costo, ricavi, stato, tipo) => ({
    campaign: { id: 111, name: "DC1 Fiori Milano ENG" },
    adGroup: { id, name: nome, status: stato || "ENABLED", type: tipo || "SEARCH_STANDARD" },
    segments: { date: giorno },
    metrics: { costMicros: costo * 1000000, impressions: 1000, clicks: 50, conversions: 3, conversionsValue: ricavi },
  });
  const gruppoAsset = (id, nome, giorno, costo, ricavi) => ({
    campaign: { id: 222, name: "DC9 Regali B2B" },
    assetGroup: { id, name: nome, status: "ENABLED" },
    segments: { date: giorno },
    metrics: { costMicros: costo * 1000000, impressions: 500, clicks: 20, conversions: 1, conversionsValue: ricavi },
  });
  const { sandbox, inviati } = ambiente({
    righeQuery: {
      "FROM ad_group ": [
        gruppo(10, "Gruppo debole", "2026-07-24", 40, 20),
        gruppo(10, "Gruppo debole", "2026-07-25", 35, 0),
        gruppo(11, "Gruppo forte", "2026-07-25", 100, 900, "PAUSED", "SEARCH_DYNAMIC_ADS"),
      ],
      "FROM asset_group ": [gruppoAsset(20, "Regali PMax", "2026-07-25", 60, 300)],
    },
    rispostaApp: () => ({ codice: 201, testo: JSON.stringify({ gruppi: { metricheSalvate: 4, gruppiCreati: 3 } }) }),
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.BRAND = "gifts";
  sandbox.AZIONE = "gruppi";
  sandbox.main();

  verifica("gruppi: vanno a /api/v1/ingest, non a /ingest/copy", inviati[0].url.indexOf("/api/v1/ingest") !== -1 && inviati[0].url.indexOf("copy") === -1, inviati[0].url);
  const g = inviati[0].corpo.gruppi;
  verifica("gruppi: una riga per giorno×gruppo", g.length === 4, g.length);
  verifica("gruppi: porta la data", g[0].data === "2026-07-24", g[0].data);
  verifica("gruppi: id gruppo con account", g[0].idGruppo === "248-656-1148:10", g[0].idGruppo);
  verifica("gruppi: aggancio esatto alla campagna", g[0].idCampagna === "111" && g[0].campagna === "DC1 Fiori Milano ENG");
  verifica("gruppi: metriche del giorno", g[0].spesa === 40 && g[0].ricavi === 20 && g[0].click === 50);
  const forte = g.find((x) => x.nome === "Gruppo forte");
  verifica("gruppi: stato piattaforma vero", forte.statoPiattaforma === "PAUSED", forte.statoPiattaforma);
  verifica("gruppi: tipo del gruppo", forte.tipo === "search_dynamic_ads", forte.tipo);
  const pmax = g.find((x) => x.nome === "Regali PMax");
  verifica("gruppi: PMax marcato asset_group_pmax", pmax && pmax.tipo === "asset_group_pmax");
  verifica("gruppi: id PMax distinto", pmax && pmax.idGruppo === "248-656-1148:ag:20", pmax && pmax.idGruppo);
}

// ───────────────────────── 3-ter. account senza PMax ─────────────────────────
{
  const { sandbox, inviati } = ambiente({
    righeQuery: {
      "FROM ad_group ": [
        {
          campaign: { id: 1, name: "DC1" },
          adGroup: { id: 1, name: "Gruppo unico", status: "ENABLED", type: "SEARCH_STANDARD" },
          segments: { date: "2026-07-25" },
          metrics: { costMicros: 1000000, impressions: 10, clicks: 1, conversions: 0, conversionsValue: 0 },
        },
      ],
      // la vista asset_group non risponde: non deve far saltare tutto
      "FROM asset_group ": "errore",
    },
    rispostaApp: () => ({ codice: 201, testo: "{}" }),
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.AZIONE = "gruppi";
  sandbox.main();
  verifica("gruppi: senza PMax manda comunque i gruppi di annunci", inviati.length === 1 && inviati[0].corpo.gruppi.length === 1);
}

// ──────────── 3-quater. pausa di un gruppo dalla coda approvata ────────────
{
  const gruppoFinto = (stato) => {
    const g = {
      _stato: stato,
      getName: () => "Gruppo debole",
      isEnabled: () => g._stato === "attivo",
      isPaused: () => g._stato === "in_pausa",
      pause: () => { g._stato = "in_pausa"; },
      enable: () => { g._stato = "attivo"; },
    };
    return g;
  };
  const gr = gruppoFinto("attivo");
  const { sandbox, inviati } = ambiente({
    selettoreGruppi: selettoreCon([gr]),
    rispostaApp: (url) =>
      url.indexOf("/api/v1/operazioni?") !== -1
        ? { codice: 200, testo: JSON.stringify({ operazioni: [
            { id: "g1", tipo: "pausa_gruppo", bersaglio: "Gruppo debole", idEsterno: "248-656-1148:10", parametri: { campagna: "DC1" } },
            { id: "g2", tipo: "pausa_gruppo", bersaglio: "Altro account", idEsterno: "825-518-1560:99", parametri: {} },
            { id: "g3", tipo: "pausa_gruppo", bersaglio: "Regali PMax", idEsterno: "248-656-1148:ag:20", parametri: {} },
          ] }) }
        : { codice: 200, testo: "{}" },
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.BRAND = "gifts";
  sandbox.AZIONE = "esegui";
  sandbox.main();

  const esiti = inviati.filter((x) => x.url.indexOf("/esito") !== -1);
  verifica("gruppo: messo in pausa davvero", gr._stato === "in_pausa", gr._stato);
  verifica("gruppo: un solo esito riferito", esiti.length === 1, esiti.length);
  verifica("gruppo: è quello di questo account", esiti[0] && esiti[0].url.indexOf("/g1/") !== -1, esiti[0] && esiti[0].url);
  verifica("gruppo: l'operazione dell'altro account è saltata in silenzio", !inviati.some((x) => x.url.indexOf("/g2/") !== -1));
  verifica("gruppo di asset PMax: saltato senza toccarlo", !inviati.some((x) => x.url.indexOf("/g3/") !== -1));
}


// ───────────────────── 1-bis. quota impressioni ─────────────────────
{
  const riga = (is, budgetLost, rankLost) => ({
    campaign: { id: 1, name: "DC1 Fiori Milano ENG", status: "ENABLED", advertisingChannelType: "SEARCH", biddingStrategyType: "TARGET_ROAS" },
    campaignBudget: { amountMicros: 30000000 },
    segments: { date: "2026-07-25" },
    metrics: {
      costMicros: 30000000, impressions: 100, clicks: 10, conversions: 1, conversionsValue: 90,
      searchImpressionShare: is, searchBudgetLostImpressionShare: budgetLost, searchRankLostImpressionShare: rankLost,
    },
  });
  const { sandbox, inviati } = ambiente({
    righeQuery: { "FROM campaign ": [riga(0.42, 0.31, 0.27)] },
    rispostaApp: () => ({ codice: 201, testo: "{}" }),
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.AZIONE = "metriche";
  sandbox.main();
  const r = inviati[0].corpo.righe[0];
  verifica("quota: mandata come frazione", r.quotaImpressioni === 0.42, r.quotaImpressioni);
  verifica("quota: persa per budget", r.persaBudget === 0.31);
  verifica("quota: persa per posizione", r.persaRank === 0.27);
}

// ───────── 1-ter. la quota non c'è: le metriche partono lo stesso ─────────
{
  const base = {
    campaign: { id: 1, name: "DC1", status: "ENABLED", advertisingChannelType: "PERFORMANCE_MAX", biddingStrategyType: "MAXIMIZE_CONVERSION_VALUE" },
    campaignBudget: { amountMicros: 30000000 },
    segments: { date: "2026-07-25" },
    metrics: { costMicros: 30000000, impressions: 100, clicks: 10, conversions: 1, conversionsValue: 90 },
  };
  let chiamate = 0;
  const { sandbox, inviati, log } = ambiente({
    rispostaApp: () => ({ codice: 201, testo: "{}" }),
    ricerca: (q) => {
      // Il messaggio è quello vero di Google: nomina il campo. Il ripiego
      // scatta SOLO su errori che parlano della quota, non su tutti.
      if (q.indexOf("search_impression_share") !== -1) {
        throw new Error("QueryError.PROHIBITED_FIELD: cannot select 'metrics.search_impression_share'");
      }
      chiamate++;
      return [base];
    },
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.AZIONE = "metriche";
  sandbox.main();
  verifica("quota assente: riprova senza e manda comunque", inviati.length === 1 && inviati[0].corpo.righe.length === 1);
  verifica("quota assente: campi a null", inviati[0].corpo.righe[0].quotaImpressioni === null);
  verifica("quota assente: lo dice nel log", log.join(String.fromCharCode(10)).indexOf("Quota impressioni non disponibile") !== -1);
}

// ───────────────────── 3-quater. diagnosi ─────────────────────
{
  const termine = (testo, costo, conv) => ({
    campaign: { id: 7, name: "DC1 Fiori Milano ENG" },
    adGroup: { name: "Gruppo A" },
    searchTermView: { searchTerm: testo, status: "NONE" },
    segments: { keyword: { info: { text: "fiori milano", matchType: "BROAD" } } },
    metrics: { costMicros: costo * 1000000, impressions: 100, clicks: 9, conversions: conv, conversionsValue: conv * 90 },
  });
  const segmento = (campo, valore, costo) => {
    const r = {
      campaign: { id: 7, name: "DC1 Fiori Milano ENG" },
      segments: {},
      metrics: { costMicros: costo * 1000000, impressions: 50, clicks: 5, conversions: 1, conversionsValue: 80 },
    };
    r.segments[campo] = valore;
    return r;
  };
  const { sandbox, inviati, log } = ambiente({
    righeQuery: {
      search_term_view: [termine("fiori finti amazon", 45, 0), termine("consegna fiori milano", 30, 2)],
      "segments.device": [segmento("device", "MOBILE", 120), segmento("device", "DESKTOP", 40)],
      "segments.day_of_week": [segmento("dayOfWeek", "MONDAY", 25)],
      "segments.ad_network_type": [segmento("adNetworkType", "SEARCH_PARTNERS", 12)],
    },
    rispostaApp: () => ({ codice: 201, testo: JSON.stringify({ terminiRicerca: { nuovi: 2, aggiornati: 0 } }) }),
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.BRAND = "gifts";
  sandbox.AZIONE = "diagnosi";
  sandbox.main();

  const corpiTermini = inviati.filter((x) => x.corpo.terminiRicerca);
  const corpiSegmenti = inviati.filter((x) => x.corpo.segmenti);
  const t = corpiTermini[0].corpo.terminiRicerca;
  verifica("diagnosi: termini inviati", t.length === 2, t.length);
  verifica("diagnosi: testo e keyword che l'ha preso", t[0].testo === "fiori finti amazon" && t[0].keyword === "fiori milano");
  verifica("diagnosi: corrispondenza della keyword", t[0].corrispondenza === "BROAD");
  verifica("diagnosi: periodo sulla riga", !!t[0].dal && !!t[0].al);
  const s2 = corpiSegmenti[0].corpo.segmenti;
  verifica("diagnosi: tre tagli di segmento", s2.length === 4, s2.length);
  const mob = s2.find((x) => x.valore === "MOBILE");
  verifica("diagnosi: dispositivo letto", mob && mob.tipo === "dispositivo" && mob.spesa === 120, mob && mob.spesa);
  verifica("diagnosi: giorno letto", !!s2.find((x) => x.tipo === "giorno" && x.valore === "MONDAY"));
  verifica("diagnosi: rete letta", !!s2.find((x) => x.tipo === "rete" && x.valore === "SEARCH_PARTNERS"));
  verifica("diagnosi: conta i termini che spendono a vuoto", log.join(String.fromCharCode(10)).indexOf("1 termini hanno speso senza convertire") !== -1);
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

// ─────────── 9. "aggiorna adesso" premuto nell'app ───────────
{
  const riga = (giorno) => ({
    campaign: { id: 1, name: "DC1", status: "ENABLED", advertisingChannelType: "SEARCH", biddingStrategyType: "TARGET_ROAS" },
    campaignBudget: { amountMicros: 30000000 },
    segments: { date: giorno },
    metrics: { costMicros: 10000000, impressions: 100, clicks: 10, conversions: 1, conversionsValue: 90 },
  });
  let finestra = null;
  const { sandbox, inviati, tutte } = ambiente({
    righeQuery: { "FROM campaign ": [riga("2026-07-20"), riga("2026-07-21")] },
    ricerca: (q) => {
      if (q.indexOf("FROM campaign ") === -1) return [];
      // si annota il periodo chiesto dalla query per controllarlo dopo
      const m = q.match(/BETWEEN '([0-9-]{10})' AND '([0-9-]{10})'/);
      if (m) finestra = Math.round((new Date(m[2]) - new Date(m[1])) / 86400000);
      return [riga("2026-07-20"), riga("2026-07-21")];
    },
    rispostaApp: (url) => {
      if (url.indexOf("/api/v1/aggiornamenti?") !== -1) {
        return { codice: 200, testo: JSON.stringify({ richieste: [{ id: "rq1", lavoro: "metriche", giorni: 30, account: "248-656-1148" }] }) };
      }
      return { codice: 201, testo: JSON.stringify({ metricheSalvate: 2 }) };
    },
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.BRAND = "gifts";
  sandbox.AZIONE = "asset"; // lo script schedulato è un ALTRO lavoro
  sandbox.main();

  const ingest = inviati.filter((x) => x.url.indexOf("/api/v1/ingest") !== -1 && x.corpo.righe);
  verifica("aggiorna adesso: lo serve anche uno script di un altro lavoro", ingest.length === 1, ingest.length);
  verifica("aggiorna adesso: usa il periodo chiesto (30 giorni)", finestra === 30, finestra);
  const esito = tutte.find((x) => x.url.indexOf("/aggiornamenti/rq1/esito") !== -1);
  verifica("aggiorna adesso: riferisce l'esito all'app", !!esito && esito.corpo.riuscita === true);
  verifica("aggiorna adesso: l'esito dice cosa ha fatto", !!esito && /righe inviate/.test(esito.corpo.dettaglio), esito && esito.corpo.dettaglio);
  verifica("aggiorna adesso: la finestra torna com'era", sandbox.GIORNI_INDIETRO === 7, sandbox.GIORNI_INDIETRO);
}

// ─────────── 9-bis. in anteprima non si serve nessuna richiesta ───────────
{
  const { sandbox, tutte } = ambiente({
    anteprima: true,
    rispostaApp: () => ({ codice: 200, testo: JSON.stringify({ richieste: [{ id: "rq2", lavoro: "metriche", giorni: 30 }] }) }),
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.AZIONE = "metriche";
  sandbox.main();
  verifica("anteprima: non chiede nemmeno le richieste", tutte.length === 0, tutte.length);
}


// ───────── 10. configurazione scritta male: non deve rompere il giro ─────────
{
  const riga = {
    campaign: { id: 1, name: "DC1", status: "ENABLED", advertisingChannelType: "SEARCH", biddingStrategyType: "TARGET_ROAS" },
    campaignBudget: { amountMicros: 30000000 },
    segments: { date: "2026-07-25" },
    metrics: { costMicros: 10000000, impressions: 100, clicks: 10, conversions: 1, conversionsValue: 90 },
  };
  let query = null;
  const { sandbox, inviati, log } = ambiente({
    ricerca: (q) => { query = q; return [riga]; },
    rispostaApp: () => ({ codice: 201, testo: "{}" }),
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.GIORNI_INDIETRO = "7 giorni"; // com'è capitato sul Cake
  sandbox.AZIONE = "metriche";
  sandbox.main();

  verifica("config storta: nessun NaN nella query", query != null && query.indexOf("NaN") === -1, query && query.slice(query.indexOf("BETWEEN"), query.indexOf("BETWEEN") + 40));
  verifica("config storta: manda comunque le righe", inviati.length === 1, inviati.length);
  verifica("config storta: lo dice nel log", log.join(String.fromCharCode(10)).indexOf("va scritto come numero puro") !== -1);
}

// ───────── 10-bis. valore senza speranza: si usa quello di riserva ─────────
{
  let query = null;
  const { sandbox, log } = ambiente({
    ricerca: (q) => { query = q; return []; },
    rispostaApp: () => ({ codice: 201, testo: "{}" }),
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.GIORNI_INDIETRO = "boh";
  sandbox.AZIONE = "metriche";
  sandbox.main();
  verifica("config assurda: ripiega sul valore di riserva", sandbox.GIORNI_INDIETRO === 7, sandbox.GIORNI_INDIETRO);
  verifica("config assurda: niente NaN nella query", query != null && query.indexOf("NaN") === -1);
}

// ───── 10-ter. un errore che non riguarda la quota non viene mascherato ─────
{
  const { sandbox, log } = ambiente({
    ricerca: () => { throw new Error("QueryError.INVALID_VALUE_WITH_BETWEEN_OPERATOR: qualcosa d'altro"); },
    rispostaApp: () => ({ codice: 201, testo: "{}" }),
  });
  sandbox.CHIAVE_API = "dmk_prova";
  sandbox.AZIONE = "metriche";
  sandbox.main();
  const testo = log.join(String.fromCharCode(10));
  verifica("errore non di quota: non lo attribuisce alla quota", testo.indexOf("Quota impressioni non disponibile") === -1);
  verifica("errore non di quota: riporta l'errore vero", /ERRORE in "metriche"/.test(testo) && /BETWEEN_OPERATOR/.test(testo));
}


// ───── 10-quater. il caso vero: "400 + INCLUDI_RIMOSSE" (che fa NaN) ─────
{
  let query = null;
  const { sandbox, inviati, log } = ambiente({
    ricerca: (q) => { query = q; return []; },
    rispostaApp: () => ({ codice: 201, testo: "{}" }),
  });
  sandbox.CHIAVE_API = "dmk_prova";
  // È esattamente ciò che era finito sul Cake: la somma con una variabile
  // dichiarata più sotto, che al momento del calcolo vale "niente".
  sandbox.GIORNI_INDIETRO = 400 + undefined;
  sandbox.AZIONE = "metriche";
  sandbox.main();
  verifica("caso Cake: niente NaN nella query", query != null && query.indexOf("NaN") === -1, query && query.slice(0, 60));
  verifica("caso Cake: ripiega su 7 giorni", sandbox.GIORNI_INDIETRO === 7, sandbox.GIORNI_INDIETRO);
  verifica("caso Cake: avvisa invece di fallire", log.join(String.fromCharCode(10)).indexOf("non è un numero") !== -1);
}

// ───────────────────────── esito ─────────────────────────
let falliti = 0;
for (const e of esiti) {
  if (!e.ok) falliti++;
  console.log((e.ok ? "  OK  " : "  KO  ") + e.nome + (e.ok || e.extra === undefined ? "" : "  → " + e.extra));
}
console.log("\n" + (esiti.length - falliti) + "/" + esiti.length + " controlli superati");
process.exit(falliti ? 1 : 0);

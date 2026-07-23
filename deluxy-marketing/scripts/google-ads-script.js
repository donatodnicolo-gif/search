/**
 * Deluxy Marketing — script per Google Ads
 * ----------------------------------------
 * Legge le campagne dell'account e manda spesa, impressioni, clic, conversioni
 * e valore conversioni all'app (endpoint /api/v1/ingest), un giorno per riga.
 *
 * PERCHÉ QUESTO INVECE DELL'API: la Google Ads API richiede un developer token
 * approvato da Google (giorni di attesa) più OAuth2 con refresh token. Gli
 * Script girano DENTRO Google Ads con le credenziali dell'account: nessuna
 * approvazione, nessun segreto da custodire lato Google.
 *
 * COME SI INSTALLA (una volta per account, ~2 minuti):
 *   1. Google Ads → Strumenti e impostazioni → Azioni collettive → Script
 *   2. "+" → Nuovo script → incolla questo file
 *   3. In fondo, compila URL_APP e CHIAVE_API qui sotto
 *   4. "Autorizza" → "Anteprima" per provare → "Esegui"
 *   5. Frequenza: "Ogni giorno" alle 7:00 (prima dell'agenda delle 9:30)
 *
 * NOTA: l'app deve essere raggiungibile da internet (quando sarà su server).
 * Da localhost lo script non può arrivarci: in quel caso si usa l'anteprima
 * per vedere i dati nel log e caricarli a mano.
 *
 * L'app NON viene mai modificata da Google: questo script scrive solo metriche.
 */

// ————————————————————————————— Configurazione —————————————————————————————
var URL_APP = "https://deluxy-marketing.vercel.app"; // senza barra finale
var CHIAVE_API = "dmk_INCOLLA_QUI_LA_CHIAVE"; // creata con: npm run chiave -- google-ads
var GIORNI_INDIETRO = 7; // rimanda anche i giorni scorsi: le conversioni maturano tardi
var BRAND = ""; // "" = dedotto dal nome campagna · oppure "flowers" | "cake" | "gifts"
// ———————————————————————————————————————————————————————————————————————————

function main() {
  var account = AdsApp.currentAccount();
  var righe = leggiMetriche();

  if (righe.length === 0) {
    Logger.log("Nessuna riga da inviare: nessuna campagna con spesa nel periodo.");
    return;
  }
  Logger.log("Righe pronte: " + righe.length + " (account " + account.getCustomerId() + ")");
  Logger.log("Esempio: " + JSON.stringify(righe[0]));

  if (CHIAVE_API.indexOf("INCOLLA") !== -1) {
    Logger.log("⚠ Chiave API non configurata: mi fermo qui. Sopra vedi i dati che avrei inviato.");
    return;
  }
  inviaAllApp(righe, account.getCustomerId());
}

/** Legge le metriche giornaliere per campagna con GAQL. */
function leggiMetriche() {
  var righe = [];
  var query =
    "SELECT campaign.id, campaign.name, campaign.status, " +
    "campaign.bidding_strategy_type, " +
    "campaign_budget.amount_micros, segments.date, " +
    "metrics.cost_micros, metrics.impressions, metrics.clicks, " +
    "metrics.conversions, metrics.conversions_value " +
    "FROM campaign " +
    "WHERE segments.date DURING LAST_" + GIORNI_INDIETRO + "_DAYS " +
    "AND campaign.status IN ('ENABLED', 'PAUSED')";

  var risultati = AdsApp.search(query, { apiVersion: "v18" });
  while (risultati.hasNext()) {
    var r = risultati.next();
    var spesa = Number(r.metrics.costMicros || 0) / 1000000;
    var budget = Number((r.campaignBudget && r.campaignBudget.amountMicros) || 0) / 1000000;
    righe.push({
      idCampagna: String(r.campaign.id),
      nome: r.campaign.name,
      data: r.segments.date, // già AAAA-MM-GG
      spesa: arrotonda(spesa),
      impression: Number(r.metrics.impressions || 0),
      click: Number(r.metrics.clicks || 0),
      conversioni: arrotonda(Number(r.metrics.conversions || 0)),
      ricavi: arrotonda(Number(r.metrics.conversionsValue || 0)),
      stato: r.campaign.status === "PAUSED" ? "in_pausa" : "attiva",
      strategiaOfferta: r.campaign.biddingStrategyType || null,
      budgetGiornaliero: budget > 0 ? arrotonda(budget) : null,
    });
  }
  return righe;
}

/** Invia all'app a blocchi: le richieste troppo grandi vengono rifiutate. */
function inviaAllApp(righe, customerId) {
  var BLOCCO = 200;
  var salvate = 0;
  for (var i = 0; i < righe.length; i += BLOCCO) {
    var lotto = righe.slice(i, i + BLOCCO);
    var corpo = {
      canale: "google_ads",
      account: customerId,
      righe: lotto,
    };
    if (BRAND) corpo.brand = BRAND;

    var risposta = UrlFetchApp.fetch(URL_APP + "/api/v1/ingest", {
      method: "post",
      contentType: "application/json",
      headers: { "x-api-key": CHIAVE_API },
      payload: JSON.stringify(corpo),
      muteHttpExceptions: true,
    });
    var codice = risposta.getResponseCode();
    if (codice >= 200 && codice < 300) {
      var esito = JSON.parse(risposta.getContentText());
      salvate += esito.metricheSalvate || 0;
      Logger.log(
        "Blocco " + (i / BLOCCO + 1) + ": " + esito.metricheSalvate + " metriche · " +
        esito.campagneCreate + " campagne nuove"
      );
    } else {
      Logger.log("⚠ Errore HTTP " + codice + ": " + risposta.getContentText().slice(0, 300));
      return;
    }
  }
  Logger.log("Fatto: " + salvate + " giorni-campagna inviati all'app.");
}

function arrotonda(n) {
  return Math.round(n * 100) / 100;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARTE 2 — KEYWORD E TESTI DEGLI ANNUNCI
   Da eseguire come script separato (stessa procedura), oppure chiamando
   mainCopy() al posto di main(). Conviene tenerli separati: le metriche di
   campagna servono ogni giorno, keyword e annunci una volta a settimana.
   ═══════════════════════════════════════════════════════════════════════════ */

var GIORNI_COPY = 30; // finestra per le metriche di keyword

function mainCopy() {
  var account = AdsApp.currentAccount();
  var keywords = leggiKeywords();
  var annunci = leggiAnnunci();

  Logger.log("Keyword lette: " + keywords.length + " · asset annuncio letti: " + annunci.length);
  if (keywords.length > 0) Logger.log("Esempio keyword: " + JSON.stringify(keywords[0]));
  if (annunci.length > 0) Logger.log("Esempio annuncio: " + JSON.stringify(annunci[0]));

  if (CHIAVE_API.indexOf("INCOLLA") !== -1) {
    Logger.log("⚠ Chiave API non configurata: mi fermo qui. Sopra vedi i dati che avrei inviato.");
    return;
  }
  inviaCopy(keywords, annunci, account.getCustomerId());
}

/** Keyword con spesa, conversioni e punteggio di qualità. */
function leggiKeywords() {
  var righe = [];
  var query =
    "SELECT campaign.name, ad_group.name, ad_group_criterion.criterion_id, " +
    "ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, " +
    "ad_group_criterion.status, ad_group_criterion.quality_info.quality_score, " +
    "metrics.cost_micros, metrics.impressions, metrics.clicks, " +
    "metrics.conversions, metrics.conversions_value " +
    "FROM keyword_view " +
    "WHERE segments.date DURING LAST_" + GIORNI_COPY + "_DAYS " +
    "AND ad_group_criterion.status != 'REMOVED'";

  var risultati = AdsApp.search(query, { apiVersion: "v18" });
  while (risultati.hasNext()) {
    var r = risultati.next();
    var qi = r.adGroupCriterion.qualityInfo;
    righe.push({
      idEsterno: String(r.adGroupCriterion.criterionId),
      testo: r.adGroupCriterion.keyword.text,
      corrispondenza: r.adGroupCriterion.keyword.matchType, // EXACT | PHRASE | BROAD
      campagna: r.campaign.name,
      gruppo: r.adGroup.name,
      spesa: arrotonda(Number(r.metrics.costMicros || 0) / 1000000),
      incasso: arrotonda(Number(r.metrics.conversionsValue || 0)),
      clic: Number(r.metrics.clicks || 0),
      impressioni: Number(r.metrics.impressions || 0),
      conversioni: arrotonda(Number(r.metrics.conversions || 0)),
      punteggioQualita: qi && qi.qualityScore ? Number(qi.qualityScore) : null,
      statoPiattaforma: r.adGroupCriterion.status, // ENABLED | PAUSED
    });
  }
  return righe;
}

/**
 * Titoli e descrizioni degli annunci responsive, con l'etichetta di rendimento
 * che Google assegna a ogni singolo asset (BEST / GOOD / LOW / LEARNING):
 * è il dato che dice quale titolo tirare e quale riscrivere.
 */
function leggiAnnunci() {
  var righe = [];
  var query =
    "SELECT campaign.name, ad_group.name, ad_group_ad.ad.id, " +
    "asset.text_asset.text, ad_group_ad_asset_view.field_type, " +
    "ad_group_ad_asset_view.performance_label, ad_group_ad.status " +
    "FROM ad_group_ad_asset_view " +
    "WHERE segments.date DURING LAST_" + GIORNI_COPY + "_DAYS " +
    "AND ad_group_ad_asset_view.field_type IN ('HEADLINE', 'DESCRIPTION')";

  var visti = {};
  var risultati = AdsApp.search(query, { apiVersion: "v18" });
  while (risultati.hasNext()) {
    var r = risultati.next();
    var testo = r.asset && r.asset.textAsset ? r.asset.textAsset.text : null;
    if (!testo) continue;
    var vista = r.adGroupAdAssetView;
    // Lo stesso testo può comparire in più annunci: una riga sola per campagna.
    var chiave = r.campaign.name + "|" + testo;
    if (visti[chiave]) continue;
    visti[chiave] = true;

    righe.push({
      testo: testo,
      tipo: vista.fieldType === "HEADLINE" ? "titolo" : "descrizione",
      campagna: r.campaign.name,
      gruppo: r.adGroup.name,
      rendimento: vista.performanceLabel || null, // BEST | GOOD | LOW | LEARNING | PENDING
      statoPiattaforma: r.adGroupAd.status,
    });
  }
  return righe;
}

/** Invia keyword e annunci a blocchi. */
function inviaCopy(keywords, annunci, customerId) {
  var BLOCCO = 150;
  var i;
  for (i = 0; i < keywords.length; i += BLOCCO) {
    postaCopy({ keywords: keywords.slice(i, i + BLOCCO) }, customerId, "keyword");
  }
  for (i = 0; i < annunci.length; i += BLOCCO) {
    postaCopy({ annunci: annunci.slice(i, i + BLOCCO) }, customerId, "annunci");
  }
}

function postaCopy(corpo, customerId, etichetta) {
  corpo.canale = "google_ads";
  corpo.account = customerId;
  if (BRAND) corpo.brand = BRAND;

  var risposta = UrlFetchApp.fetch(URL_APP + "/api/v1/ingest/copy", {
    method: "post",
    contentType: "application/json",
    headers: { "x-api-key": CHIAVE_API },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true,
  });
  var codice = risposta.getResponseCode();
  if (codice >= 200 && codice < 300) {
    Logger.log(etichetta + " inviati: " + risposta.getContentText());
  } else {
    Logger.log("⚠ Errore HTTP " + codice + " su " + etichetta + ": " + risposta.getContentText().slice(0, 300));
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARTE 3 — ASSET: SITELINK, CALLOUT, SNIPPET, IMMAGINI
   Gli asset in Google Ads stanno su tre livelli: account, campagna e gruppo
   di annunci. Questo script li legge tutti e tre e dice a quale livello sono
   agganciati — è la domanda che serve per capire se un gruppo ha i sitelink
   suoi o eredita quelli della campagna.
   ═══════════════════════════════════════════════════════════════════════════ */

function mainAsset() {
  var account = AdsApp.currentAccount();
  var asset = []
    .concat(leggiAsset("customer_asset", "account"))
    .concat(leggiAsset("campaign_asset", "campagna"))
    .concat(leggiAsset("ad_group_asset", "gruppo"));

  Logger.log("Asset letti: " + asset.length);
  var perTipo = {};
  for (var i = 0; i < asset.length; i++) {
    var k = asset[i].tipo + " @ " + asset[i].livello;
    perTipo[k] = (perTipo[k] || 0) + 1;
  }
  Logger.log("Riepilogo: " + JSON.stringify(perTipo));
  if (asset.length > 0) Logger.log("Esempio: " + JSON.stringify(asset[0]));

  if (CHIAVE_API.indexOf("INCOLLA") !== -1) {
    Logger.log("⚠ Chiave API non configurata: mi fermo qui.");
    return;
  }
  for (var j = 0; j < asset.length; j += 150) {
    postaCopy({ annunci: asset.slice(j, j + 150) }, account.getCustomerId(), "asset");
  }
}

/**
 * Legge gli asset da una delle tre viste. Il contesto cambia col livello
 * (customer_asset / campaign_asset / ad_group_asset) ma i campi dell'asset
 * in sé sono gli stessi.
 */
function leggiAsset(vista, livello) {
  var righe = [];
  var campiContesto =
    vista === "campaign_asset" ? "campaign.name, " :
    vista === "ad_group_asset" ? "campaign.name, ad_group.name, " : "";

  var query =
    "SELECT " + campiContesto + "asset.id, asset.type, asset.name, " +
    "asset.sitelink_asset.link_text, asset.sitelink_asset.description1, " +
    "asset.sitelink_asset.description2, asset.final_urls, " +
    "asset.callout_asset.callout_text, " +
    "asset.structured_snippet_asset.header, asset.structured_snippet_asset.values, " +
    "asset.image_asset.full_size.url, asset.image_asset.full_size.width_pixels, " +
    "asset.image_asset.full_size.height_pixels " +
    "FROM " + vista + " " +
    "WHERE " + vista + ".status != 'REMOVED' " +
    "AND asset.type IN ('SITELINK', 'CALLOUT', 'STRUCTURED_SNIPPET', 'IMAGE')";

  var risultati;
  try {
    risultati = AdsApp.search(query, { apiVersion: "v18" });
  } catch (e) {
    Logger.log("Vista " + vista + " non disponibile: " + e);
    return righe;
  }

  while (risultati.hasNext()) {
    var r = risultati.next();
    var a = r.asset;
    var riga = {
      idEsterno: String(a.id),
      campagna: (r.campaign && r.campaign.name) || "(account)",
      gruppo: (r.adGroup && r.adGroup.name) || null,
      livello: livello,
      statoPiattaforma: "ENABLED",
    };

    if (a.type === "SITELINK" && a.sitelinkAsset) {
      riga.tipo = "sitelink";
      riga.testo = a.sitelinkAsset.linkText;
      riga.note = [a.sitelinkAsset.description1, a.sitelinkAsset.description2]
        .filter(function (x) { return x; })
        .join(" · ");
      riga.finalUrl = a.finalUrls && a.finalUrls.length ? a.finalUrls[0] : null;
    } else if (a.type === "CALLOUT" && a.calloutAsset) {
      riga.tipo = "callout";
      riga.testo = a.calloutAsset.calloutText;
    } else if (a.type === "STRUCTURED_SNIPPET" && a.structuredSnippetAsset) {
      riga.tipo = "snippet";
      riga.testo = a.structuredSnippetAsset.header;
      riga.note = (a.structuredSnippetAsset.values || []).join(" · ");
    } else if (a.type === "IMAGE" && a.imageAsset) {
      riga.tipo = "immagine";
      riga.testo = a.name || ("Immagine " + a.id);
      var dim = a.imageAsset.fullSize;
      riga.anteprima = dim ? dim.url : null;
      riga.note = dim ? dim.widthPixels + "x" + dim.heightPixels : null;
    } else {
      continue;
    }
    righe.push(riga);
  }
  return righe;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARTE 4 — ESECUZIONE DELLE OPERAZIONI APPROVATE (scrittura)
   Questo script SCRIVE su Google Ads, ma solo ciò che è stato approvato a
   mano nell'app. Non decide nulla da sé: chiede all'app "cosa devo fare?",
   esegue, e riferisce. Se l'app non risponde, non fa niente.
   ═══════════════════════════════════════════════════════════════════════════ */

function mainEsegui() {
  var account = AdsApp.currentAccount();
  var operazioni = chiediOperazioni(account.getCustomerId());

  if (operazioni.length === 0) {
    Logger.log("Nessuna operazione approvata da eseguire.");
    return;
  }
  Logger.log("Operazioni approvate da eseguire: " + operazioni.length);

  for (var i = 0; i < operazioni.length; i++) {
    var op = operazioni[i];
    try {
      var esito = esegui(op);
      riferisci(op.id, true, esito.dettaglio, esito.prima, esito.dopo);
      Logger.log("OK " + op.tipo + " su " + op.bersaglio + " - " + esito.dettaglio);
    } catch (e) {
      riferisci(op.id, false, String(e), null, null);
      Logger.log("ERRORE " + op.tipo + " su " + op.bersaglio + " - " + e);
    }
  }
}

function chiediOperazioni(customerId) {
  var risposta = UrlFetchApp.fetch(
    URL_APP + "/api/v1/operazioni?canale=google_ads&account=" + encodeURIComponent(customerId),
    { headers: { "x-api-key": CHIAVE_API }, muteHttpExceptions: true }
  );
  if (risposta.getResponseCode() !== 200) {
    Logger.log("L'app non risponde (" + risposta.getResponseCode() + "): non eseguo nulla.");
    return [];
  }
  return JSON.parse(risposta.getContentText()).operazioni || [];
}

/** Esegue una singola operazione. Ogni ramo legge lo stato PRIMA di cambiarlo. */
function esegui(op) {
  var campagna;
  if (op.tipo === "pausa_campagna" || op.tipo === "attiva_campagna" || op.tipo === "budget" || op.tipo === "negativa") {
    campagna = trovaCampagna(op);
    if (!campagna) throw new Error("Campagna non trovata: " + op.bersaglio);
  }

  if (op.tipo === "pausa_campagna") {
    var eraAttiva = campagna.isEnabled();
    campagna.pause();
    return { dettaglio: "campagna messa in pausa", prima: eraAttiva ? "attiva" : "gia in pausa", dopo: "in pausa" };
  }
  if (op.tipo === "attiva_campagna") {
    var eraPausa = campagna.isPaused();
    campagna.enable();
    return { dettaglio: "campagna riattivata", prima: eraPausa ? "in pausa" : "gia attiva", dopo: "attiva" };
  }
  if (op.tipo === "budget") {
    var nuovo = Number(op.parametri.budget);
    if (!nuovo || nuovo <= 0) throw new Error("Budget non valido");
    var budget = campagna.getBudget();
    var vecchio = budget.getAmount();
    budget.setAmount(nuovo);
    return { dettaglio: "budget " + vecchio + " -> " + nuovo + " euro/g", prima: vecchio + " euro/g", dopo: nuovo + " euro/g" };
  }
  if (op.tipo === "negativa") {
    var testo = op.parametri.testo;
    if (!testo) throw new Error("Testo della negativa mancante");
    campagna.createNegativeKeyword(testo);
    return { dettaglio: "negativa aggiunta: " + testo, prima: "assente", dopo: testo };
  }
  if (op.tipo === "pausa_keyword" || op.tipo === "attiva_keyword") {
    var kw = trovaKeyword(op);
    if (!kw) throw new Error("Keyword non trovata: " + op.bersaglio);
    if (op.tipo === "pausa_keyword") {
      kw.pause();
      return { dettaglio: "keyword in pausa", prima: "attiva", dopo: "in pausa" };
    }
    kw.enable();
    return { dettaglio: "keyword riattivata", prima: "in pausa", dopo: "attiva" };
  }
  throw new Error("Tipo di operazione non gestito: " + op.tipo);
}

function trovaCampagna(op) {
  var it = op.idEsterno
    ? AdsApp.campaigns().withIds([Number(op.idEsterno)]).get()
    : AdsApp.campaigns().withCondition("campaign.name = '" + apici(op.bersaglio) + "'").get();
  return it.hasNext() ? it.next() : null;
}

function trovaKeyword(op) {
  var it = op.idEsterno
    ? AdsApp.keywords().withCondition("ad_group_criterion.criterion_id = " + op.idEsterno).get()
    : AdsApp.keywords().withCondition("ad_group_criterion.keyword.text = '" + apici(op.bersaglio) + "'").get();
  return it.hasNext() ? it.next() : null;
}

function apici(s) {
  return String(s).split("'").join("\\'");
}

function riferisci(idOperazione, riuscita, dettaglio, prima, dopo) {
  UrlFetchApp.fetch(URL_APP + "/api/v1/operazioni/" + idOperazione + "/esito", {
    method: "post",
    contentType: "application/json",
    headers: { "x-api-key": CHIAVE_API },
    payload: JSON.stringify({ riuscita: riuscita, dettaglio: dettaglio, prima: prima, dopo: dopo }),
    muteHttpExceptions: true,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARTE 5 — STATO DI APPROVAZIONE DEGLI ANNUNCI (alert A4)
   Il doc 11 §4 chiede di controllare se più del 50% degli annunci attivi è in
   revisione o limitato da oltre 24 ore. È l'unico alert che non si legge dalle
   metriche: serve lo stato di policy di ogni annuncio.
   Da eseguire insieme a main(), o come script suo ogni giorno.
   ═══════════════════════════════════════════════════════════════════════════ */

function mainApprovazioni() {
  var account = AdsApp.currentAccount();
  var perCampagna = leggiApprovazioni();
  var righe = [];
  for (var nome in perCampagna) {
    if (!Object.prototype.hasOwnProperty.call(perCampagna, nome)) continue;
    righe.push({
      idCampagna: perCampagna[nome].id,
      nome: nome,
      // La data serve all'endpoint: qui vale oggi, i conteggi sono istantanei
      data: oggiIso(),
      annunciTotali: perCampagna[nome].totali,
      annunciInReview: perCampagna[nome].inReview,
    });
  }

  Logger.log("Campagne con annunci: " + righe.length);
  for (var i = 0; i < righe.length; i++) {
    if (righe[i].annunciInReview > 0) {
      Logger.log(
        "  " + righe[i].nome + ": " + righe[i].annunciInReview + "/" + righe[i].annunciTotali + " in revisione"
      );
    }
  }

  if (CHIAVE_API.indexOf("INCOLLA") !== -1) {
    Logger.log("Chiave API non configurata: mi fermo qui.");
    return;
  }
  for (var j = 0; j < righe.length; j += 200) {
    postaIngest(righe.slice(j, j + 200), account.getCustomerId());
  }
}

/**
 * Conta, per campagna, quanti annunci attivi sono in revisione o limitati.
 * approvalStatus: APPROVED | APPROVED_LIMITED | AREA_OF_INTEREST_ONLY |
 * DISAPPROVED · reviewStatus: REVIEW_IN_PROGRESS | REVIEWED | UNDER_APPEAL
 */
function leggiApprovazioni() {
  var perCampagna = {};
  var query =
    "SELECT campaign.id, campaign.name, ad_group_ad.ad.id, " +
    "ad_group_ad.policy_summary.approval_status, " +
    "ad_group_ad.policy_summary.review_status " +
    "FROM ad_group_ad " +
    "WHERE ad_group_ad.status = 'ENABLED' AND campaign.status = 'ENABLED'";

  var risultati;
  try {
    risultati = AdsApp.search(query, { apiVersion: "v18" });
  } catch (e) {
    Logger.log("Impossibile leggere gli stati di approvazione: " + e);
    return perCampagna;
  }

  while (risultati.hasNext()) {
    var r = risultati.next();
    var nome = r.campaign.name;
    if (!perCampagna[nome]) {
      perCampagna[nome] = { id: String(r.campaign.id), totali: 0, inReview: 0 };
    }
    perCampagna[nome].totali++;
    var ps = r.adGroupAd.policySummary || {};
    var limitato = ps.approvalStatus === "APPROVED_LIMITED" || ps.approvalStatus === "AREA_OF_INTEREST_ONLY";
    var inEsame = ps.reviewStatus === "REVIEW_IN_PROGRESS" || ps.reviewStatus === "UNDER_APPEAL";
    if (limitato || inEsame) perCampagna[nome].inReview++;
  }
  return perCampagna;
}

function postaIngest(righe, customerId) {
  var corpo = { canale: "google_ads", account: customerId, righe: righe };
  if (BRAND) corpo.brand = BRAND;
  var risposta = UrlFetchApp.fetch(URL_APP + "/api/v1/ingest", {
    method: "post",
    contentType: "application/json",
    headers: { "x-api-key": CHIAVE_API },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true,
  });
  Logger.log("Approvazioni inviate: " + risposta.getResponseCode() + " " + risposta.getContentText().slice(0, 150));
}

function oggiIso() {
  var d = new Date();
  var m = String(d.getMonth() + 1);
  var g = String(d.getDate());
  if (m.length < 2) m = "0" + m;
  if (g.length < 2) g = "0" + g;
  return d.getFullYear() + "-" + m + "-" + g;
}

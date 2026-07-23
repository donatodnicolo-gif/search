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

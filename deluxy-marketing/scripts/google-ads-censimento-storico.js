/**
 * Deluxy Marketing — CENSIMENTO STORICO DELLE CAMPAGNE (script ad hoc)
 * ---------------------------------------------------------------------------
 * SI USA UNA VOLTA. Non va schedulato: è una fotografia del passato, e il
 * passato non cambia. Si incolla in Google Ads (Strumenti → Bulk actions →
 * Scripts → +), si mettono CHIAVE_API e ANNI, si preme ANTEPRIMA e poi ESEGUI.
 * Va fatto UNA VOLTA PER ACCOUNT: Cake, Gifts, Flowers.
 *
 * ⚠️ A COSA SERVE, e perché lo script di tutti i giorni non basta.
 * Lo script normale (`google-ads-script.js`) manda le metriche di una FINESTRA
 * CORTA (`GIORNI_INDIETRO`, di solito 30 giorni) e, se `INCLUDI_RIMOSSE` è
 * false, salta le campagne rimosse. Conseguenza: tutto quello che è stato
 * spento e cancellato prima di quella finestra, per l'app NON È MAI ESISTITO.
 * Non compare come «zero spesa»: proprio non c'è. Alla domanda «quante
 * campagne abbiamo avuto in tre anni e quanto sono costate», l'elenco delle
 * campagne dell'app risponde a un'altra domanda e sembra rispondere a questa.
 *
 * ⚠️ PERCHÉ LE RIMOSSE SI VEDONO DA QUI. Gli iteratori (`AdsApp.campaigns()`)
 * escludono le rimosse per scelta di Google. La query GAQL (`AdsApp.search`)
 * NON filtra per stato se non glielo si chiede: le rimosse tornano, con la
 * loro spesa. Per questo qui non c'è nessun `WHERE campaign.status IN (…)` —
 * l'assenza di quel filtro è il cuore dello script, non una dimenticanza.
 *
 * ⚠️ COSA MANDA: una riga per CAMPAGNA per ANNO — nome, id, stato, tipo,
 * spesa, click, conversioni, ricavi, primo e ultimo mese con spesa. NON il
 * giorno per giorno: serve sapere quali e quante campagne c'erano e quanto
 * sono costate, non rifare la storia di ognuna.
 *
 * ⚠️ COSA NON PUÒ SAPERE: una campagna creata e MAI avviata non ha nessuna
 * riga di metriche, quindi non compare. Vale per Google come per Meta.
 */

// ══════════════════════ DA RIEMPIRE ══════════════════════
var APP = "https://deluxy-marketing.vercel.app";
var CHIAVE_API = "INCOLLA_QUI_LA_CHIAVE"; // chiave con permesso di SCRITTURA
var ANNI = 3; // quanti anni indietro: 3 = dal 1° gennaio di tre anni fa a oggi
var ANTEPRIMA = false; // true = guarda e conta, non manda niente all'app
// =========================================================

var BLOCCO = 200; // righe per invio
var TENTATIVI = 3;

function main() {
  var conto = AdsApp.currentAccount();
  var account = conto.getCustomerId();
  var nome = conto.getName();
  var oggi = new Date();
  var annoFine = oggi.getFullYear();
  var annoInizio = annoFine - ANNI;

  Logger.log("═══ CENSIMENTO STORICO · " + nome + " (" + account + ") ═══");
  Logger.log("Anni: " + annoInizio + " → " + annoFine + (ANTEPRIMA ? " · ANTEPRIMA" : ""));

  if (!ANTEPRIMA && (!CHIAVE_API || CHIAVE_API.indexOf("INCOLLA") === 0)) {
    Logger.log("⚠ CHIAVE_API non impostata: metti la chiave o lascia ANTEPRIMA = true.");
    return;
  }

  var tutte = {}; // idCampagna|anno → riga
  var totali = {}; // anno → { campagne: {}, spesa: n }

  for (var anno = annoInizio; anno <= annoFine; anno++) {
    var dal = anno + "-01-01";
    var al = anno === annoFine ? iso(oggi) : anno + "-12-31";

    // ⚠️ NESSUN filtro sullo stato: è così che entrano le REMOVED, cioè
    // esattamente le campagne che nessun altro giro racconta.
    var query =
      "SELECT campaign.id, campaign.name, campaign.status, " +
      "campaign.advertising_channel_type, segments.month, " +
      "metrics.cost_micros, metrics.impressions, metrics.clicks, " +
      "metrics.conversions, metrics.conversions_value " +
      "FROM campaign " +
      "WHERE segments.date BETWEEN '" + dal + "' AND '" + al + "'";

    var righeAnno = 0;
    var risultati;
    try {
      risultati = AdsApp.search(query);
    } catch (e) {
      Logger.log("⚠ " + anno + ": la query non è piaciuta a Google (" + e + "). Salto l'anno.");
      continue;
    }

    while (risultati.hasNext()) {
      var r = risultati.next();
      var id = String(r.campaign.id);
      var chiave = id + "|" + anno;
      var mese = meseDa(r.segments && r.segments.month);
      var spesa = Number((r.metrics && r.metrics.costMicros) || 0) / 1000000;

      var v = tutte[chiave];
      if (!v) {
        v = {
          idEsterno: id,
          nome: r.campaign.name,
          anno: anno,
          stato: r.campaign.status,
          tipo: r.campaign.advertisingChannelType || null,
          spesa: 0,
          impression: 0,
          click: 0,
          conversioni: 0,
          ricavi: 0,
          primoMese: null,
          ultimoMese: null,
          mesiAttivi: 0,
        };
        tutte[chiave] = v;
      }
      v.spesa += spesa;
      v.impression += Number((r.metrics && r.metrics.impressions) || 0);
      v.click += Number((r.metrics && r.metrics.clicks) || 0);
      v.conversioni += Number((r.metrics && r.metrics.conversions) || 0);
      v.ricavi += Number((r.metrics && r.metrics.conversionsValue) || 0);
      // ⚠️ «Mese attivo» = mese in cui ha SPESO. Google manda righe anche per
      // mesi a zero, e contarle direbbe che una campagna morta a marzo ha
      // lavorato tutto l'anno.
      if (spesa > 0 && mese) {
        v.mesiAttivi++;
        if (v.primoMese === null || mese < v.primoMese) v.primoMese = mese;
        if (v.ultimoMese === null || mese > v.ultimoMese) v.ultimoMese = mese;
      }

      righeAnno++;
      if (!totali[anno]) totali[anno] = { campagne: {}, spesa: 0 };
      totali[anno].campagne[id] = true;
      totali[anno].spesa += spesa;
    }

    Logger.log(
      anno + ": " + contaChiavi(totali[anno] ? totali[anno].campagne : {}) + " campagne · " +
      arrotonda(totali[anno] ? totali[anno].spesa : 0) + " € · " + righeAnno + " righe mese"
    );
  }

  var righe = [];
  var campagneUniche = {};
  var spesaTotale = 0;
  for (var k in tutte) {
    if (!tutte.hasOwnProperty(k)) continue;
    var riga = tutte[k];
    riga.spesa = arrotonda(riga.spesa);
    riga.conversioni = arrotonda(riga.conversioni);
    riga.ricavi = arrotonda(riga.ricavi);
    righe.push(riga);
    campagneUniche[riga.idEsterno] = true;
    spesaTotale += riga.spesa;
  }

  Logger.log("");
  Logger.log("──────── RIEPILOGO ────────");
  Logger.log(
    contaChiavi(campagneUniche) + " campagne distinte · " + righe.length +
    " righe (campagna × anno) · " + arrotonda(spesaTotale) + " € in tutto"
  );
  var rimosse = 0;
  for (var i = 0; i < righe.length; i++) if (righe[i].stato === "REMOVED") rimosse++;
  Logger.log(rimosse + " righe di campagne RIMOSSE: sono quelle che l'app non ha mai visto.");
  if (righe.length > 0) Logger.log("Esempio: " + JSON.stringify(righe[0]));

  if (ANTEPRIMA) {
    Logger.log("ANTEPRIMA: non ho mandato niente all'app.");
    return;
  }
  if (righe.length === 0) {
    Logger.log("Niente da mandare: nessuna riga nel periodo.");
    return;
  }

  var inviate = 0;
  for (var p = 0; p < righe.length; p += BLOCCO) {
    var lotto = righe.slice(p, p + BLOCCO);
    var esito = manda({ canale: "google_ads", account: account, righe: lotto });
    if (!esito.ok) {
      Logger.log("⚠ Invio fermato al blocco " + (p / BLOCCO + 1) + ": " + esito.errore);
      Logger.log("Le " + inviate + " righe già arrivate restano: il censimento è ripetibile, si rilancia.");
      return;
    }
    inviate += lotto.length;
    Logger.log("→ " + inviate + "/" + righe.length + " · " + (esito.dati && esito.dati.messaggio));
  }
  Logger.log("✓ Censimento mandato all'app: " + inviate + " righe.");
}

function manda(corpo) {
  var opzioni = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(corpo),
    headers: { "x-api-key": CHIAVE_API },
    muteHttpExceptions: true,
  };
  for (var t = 1; t <= TENTATIVI; t++) {
    try {
      var r = UrlFetchApp.fetch(APP + "/api/v1/censimento", opzioni);
      var codice = r.getResponseCode();
      if (codice >= 200 && codice < 300) {
        return { ok: true, dati: JSON.parse(r.getContentText()) };
      }
      // 4xx non si riprova: è il corpo o la chiave, e riprovare tre volte la
      // stessa cosa sbagliata fa solo perdere tempo con lo stesso esito.
      if (codice >= 400 && codice < 500) {
        return { ok: false, errore: codice + " " + r.getContentText().slice(0, 200) };
      }
      Logger.log("  tentativo " + t + ": " + codice + ", riprovo…");
    } catch (e) {
      Logger.log("  tentativo " + t + ": " + e);
    }
    Utilities.sleep(2000 * t);
  }
  return { ok: false, errore: "nessuna risposta dopo " + TENTATIVI + " tentativi" };
}

function meseDa(valore) {
  // segments.month arriva come "2024-03-01": il mese sono le due cifre in mezzo.
  if (!valore) return null;
  var m = Number(String(valore).slice(5, 7));
  return m >= 1 && m <= 12 ? m : null;
}

function iso(d) {
  var m = d.getMonth() + 1;
  var g = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (g < 10 ? "0" + g : g);
}

function arrotonda(n) {
  return Math.round(Number(n) * 100) / 100;
}

function contaChiavi(o) {
  var n = 0;
  for (var k in o) if (o.hasOwnProperty(k)) n++;
  return n;
}

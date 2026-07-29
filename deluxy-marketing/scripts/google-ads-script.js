/**
 * Deluxy Marketing — script per Google Ads · v2 (26/07/2026)
 * ----------------------------------------------------------
 * Legge l'account e manda i dati all'app (spesa, keyword, annunci, asset,
 * stati di approvazione); su richiesta esegue le operazioni GIÀ APPROVATE
 * a mano nell'app. Non decide mai nulla da sé.
 *
 * PERCHÉ QUESTO INVECE DELL'API: la Google Ads API richiede un developer token
 * approvato da Google (giorni di attesa) più OAuth2 con refresh token. Gli
 * Script girano DENTRO Google Ads con le credenziali dell'account: nessuna
 * approvazione, nessun segreto da custodire lato Google.
 *
 * COME SI INSTALLA (una copia per account, ~2 minuti):
 *   1. Google Ads → Strumenti e impostazioni → Azioni collettive → Script
 *   2. "+" → Nuovo script → incolla questo file
 *   3. Compila la CONFIGURAZIONE qui sotto: CHIAVE_API, BRAND e soprattutto
 *      AZIONE (Google Ads esegue SEMPRE main(): è AZIONE che decide cosa fa).
 *   4. "Autorizza" → "Anteprima" per provare a vuoto → "Esegui"
 *   5. Frequenza (colonna "Frequenza" nella lista degli script, non basta
 *      "Esegui": quello lancia una volta sola).
 *
 * UNO SCRIPT PER LAVORO, stesso file, cambia solo AZIONE:
 *   AZIONE = "metriche"     → ogni giorno, fascia 23:00-24:00 (manda anche
 *                              l'anagrafica: le campagne che esistono, comprese
 *                              quelle ferme che non hanno giorni da mandare)
 *   AZIONE = "approvazioni" → ogni giorno, mattina (alert A4)
 *   AZIONE = "copy"         → ogni settimana (keyword + titoli/descrizioni RSA)
 *   AZIONE = "gruppi"       → ogni settimana (gruppi di annunci con spesa e resa,
 *                             e gruppi di asset per le Performance Max)
 *   AZIONE = "asset"        → ogni settimana (sitelink, callout, snippet, immagini)
 *   AZIONE = "diagnosi"     → ogni settimana (termini di ricerca cercati davvero,
 *                             spesa per dispositivo, giorno e rete)
 *   AZIONE = "esegui"       → solo quando serve: esegue le operazioni approvate
 *   AZIONE = "tutto"        → le fa tutte in fila (comodo per il primo giro)
 *
 * QUALE ORA per le metriche: a fine giornata la SPESA è completa ma le
 * CONVERSIONI no — Google le consolida nelle ore e nei giorni dopo. Per questo
 * GIORNI_INDIETRO rimanda anche i giorni scorsi: qualunque ora si scelga, i
 * numeri si correggono da soli entro una settimana.
 *
 * ANTEPRIMA: in modalità anteprima Google blocca le modifiche all'account ma
 * NON le chiamate a internet. Questo script se ne accorge da solo e non manda
 * niente all'app: così provare "esegui" in anteprima non segna un'operazione
 * come eseguita quando in realtà non è successo nulla.
 *
 * NOVITÀ DELLA v2 (rispetto alla prima versione)
 *   · un solo file, si sceglie il lavoro con AZIONE (prima bisognava rinominare
 *     le funzioni a mano in ogni copia)
 *   · ritenta le chiamate fallite e rimpicciolisce i blocchi se l'app va in
 *     timeout, invece di fermarsi al primo errore
 *   · le keyword uguali in più gruppi vengono SOMMATE prima dell'invio: prima
 *     si sovrascrivevano fra loro e vinceva l'ultima letta
 *   · gli identificativi mandati all'app portano dentro l'account, così tre
 *     account non si pestano più i piedi sulle stesse keyword/asset
 *   · "esegui" riconosce anche PMax/Shopping/Video, si rifiuta di toccare
 *     budget CONDIVISI, controlla che l'app abbia davvero registrato l'esito
 *     (prima poteva rifare due volte la stessa operazione) e salta — senza
 *     segnarle fallite — le operazioni di un altro account
 *   · GIORNI_COPY libero (prima solo 7, 14 o 30 funzionavano davvero)
 *   · INCLUDI_RIMOSSE per il caricamento storico: senza, la spesa delle
 *     campagne poi eliminate non entrava mai nello storico
 *   · AZIONE = "gruppi": i gruppi di annunci arrivano con spesa, clic,
 *     conversioni e incasso propri (prima il gruppo era solo un'etichetta
 *     attaccata alle keyword) e si leggono in "Copy & annunci"; per le PMax,
 *     che gruppi di annunci non ne hanno, arrivano i gruppi di asset
 *
 * L'app NON viene mai modificata da Google: questo script manda metriche e
 * chiede quali operazioni approvate eseguire. Niente altro.
 */

// ═══════════════════════════════ CONFIGURAZIONE ═══════════════════════════════

var URL_APP = "https://deluxy-marketing.vercel.app"; // senza barra finale
var CHIAVE_API = "dmk_INCOLLA_QUI_LA_CHIAVE"; // creata con: npm run chiave -- google-ads-<brand>

// Cosa fa questo script: metriche | approvazioni | copy | gruppi | asset | diagnosi | esegui | tutto
var AZIONE = "metriche";

// Brand dell'account. Metterlo: senza, le campagne il cui nome non dice il
// marchio (es. "DC1 Fiori Milano ENG") finiscono nel calderone "cross".
//   825-518-1560 → "flowers" · 248-656-1148 → "gifts" · 846-090-5423 → "cake"
var BRAND = "";

// Quanti giorni rimandare a ogni giro.
// ATTENZIONE: questa e la riga sotto sono DUE impostazioni separate, non una
// somma. Qui va un numero e basta; sotto va true o false.
//
//   uso di tutti i giorni  →  GIORNI_INDIETRO = 7     ·  INCLUDI_RIMOSSE = false
//   caricamento storico    →  GIORNI_INDIETRO = 400   ·  INCLUDI_RIMOSSE = true
//
// Dopo il caricamento storico si rimettono i valori di tutti i giorni.
// (Scrivere qualcosa come "400 + INCLUDI_RIMOSSE" produce NaN e il periodo
// diventa impossibile: lo script se ne accorge, avvisa e ripiega su 7.)
var GIORNI_INDIETRO = 7;

// Includere anche le campagne ELIMINATE. Serve solo al caricamento storico:
// senza, la spesa delle campagne cancellate nel frattempo non entra mai.
var INCLUDI_RIMOSSE = false;

// Finestra delle metriche di keyword, annunci e gruppi (qualunque numero, non
// solo 7/14/30). 30 giorni è la lettura standard dei Definitivi.
var GIORNI_COPY = 30;

// Finestra dei NUMERI degli asset (sitelink, callout, snippet, immagini).
// Separata da GIORNI_COPY perche' "quale sitelink ha reso di piu" e' una
// domanda che si fa su anni, non su un mese. Gli asset RIMOSSI non tornano
// comunque: quelli spenti anni fa sono persi per sempre.
var GIORNI_ASSET = 365;

// SCRITTURA (solo con AZIONE = "esegui")
// Rete di sicurezza in più rispetto ai guardrail dell'app: rifiuta un budget
// che cambia di più di questo fattore (3 = da 20 €/g si può andare da 6,66 a 60).
var LIMITE_BUDGET_X = 3;
// Le campagne nuove nascono senza account indicato: si creano qui solo se il
// nome dice il brand di questo account. Se il nome non lo dice (es. "DC13 …"),
// l'operazione viene saltata a meno che questa non sia true.
var ACCETTA_CAMPAGNE_SENZA_BRAND = false;

// ══════════════════════════════════════════════════════════════════════════════

var BLOCCO_INIZIALE = 200; // righe per richiesta; si dimezza da solo se l'app arranca
var BLOCCO_MINIMO = 25;
var TENTATIVI = 3;
var MINUTI_MASSIMI = 25; // Google ferma gli script a 30': ci fermiamo prima, con ordine

// L'ORDINE DEI LAVORI, scritto una volta sola perché vale in due punti: il giro
// normale (AZIONE = "tutto") e le richieste che arrivano dall'app.
//
// Google ferma lo script dopo 30 minuti, e quello che non entra nei 30 minuti
// semplicemente non succede: l'ordine decide cosa si perde, quindi va deciso
// apposta invece di lasciarlo al caso.
//   1. le letture che si guardano ogni giorno: metriche e gruppi di annunci;
//   2. in fondo il copy, che da solo può prendersi metà del tempo (mille
//      keyword per account a blocchi di 200) ed è la lettura meno urgente.
var LAVORI_LETTURA = ["metriche", "gruppi", "approvazioni", "diagnosi", "asset", "copy"];

var ANTEPRIMA = false; // deciso da verificaConfigurazione()
var TERMINI_INVIATI = false; // le parole cercate si mandano una volta per giro
var INIZIO = new Date().getTime();
var RIEPILOGO = [];

function main() {
  var conto = verificaConfigurazione();
  if (!conto) return;

  // Prima del proprio lavoro, ogni script guarda se dall'app hanno premuto
  // "Aggiorna adesso": è l'unico modo che l'app ha di farsi sentire, perché
  // gli Script si avviano solo da dentro Google.
  serviRichieste(conto);

  // L'ORDINE CONTA: Google ferma lo script dopo 30 minuti, e quello che non
  // entra nei 30 minuti semplicemente non succede. Quindi l'ordine decide cosa
  // si perde, e va deciso apposta invece di lasciarlo al caso.
  //
  // 1. "esegui" PER PRIMO. È l'unico lavoro che CAMBIA qualcosa su Google Ads:
  //    applica le modifiche che l'utente ha già approvato nell'app. Costa
  //    pochi secondi (due o tre operazioni per volta), ma stando in fondo
  //    rischiava di non arrivare mai: si approva la pausa di un gruppo che
  //    brucia, lo script passa 28 minuti a leggere dati, viene fermato, e il
  //    gruppo resta acceso un altro giorno. Prima si fa quello che è stato
  //    deciso, poi si guarda com'è andata: i dati non perdono niente ad
  //    aspettare mezzo minuto, una decisione sì.
  // 2. Poi ciò che si guarda ogni giorno: metriche e gruppi di annunci.
  // 3. Per ultimo il copy, che da solo può prendersi metà del tempo (mille
  //    keyword per account a blocchi di 200) ed è la lettura meno urgente:
  //    se salta si rimanda al giro dopo senza che nessuno se ne accorga.
  // "esegui" PER PRIMO: è l'unico lavoro che CAMBIA qualcosa su Google Ads —
  // applica le modifiche già approvate nell'app. Costa pochi secondi, ma
  // stando in fondo rischiava di non arrivare mai: si approva la pausa di un
  // gruppo che brucia, lo script passa 28 minuti a leggere, viene fermato, e
  // il gruppo resta acceso un altro giorno. I dati non perdono niente ad
  // aspettare mezzo minuto, una decisione sì.
  var lavori = AZIONE === "tutto" ? ["esegui"].concat(LAVORI_LETTURA) : [AZIONE];

  for (var i = 0; i < lavori.length; i++) {
    var lavoro = lavori[i];
    Logger.log("");
    Logger.log("──────── " + lavoro.toUpperCase() + " ────────");
    try {
      if (lavoro === "metriche") mandaMetriche(conto);
      else if (lavoro === "copy") mandaCopy(conto);
      else if (lavoro === "gruppi") mandaGruppi(conto);
      else if (lavoro === "asset") mandaAsset(conto);
      else if (lavoro === "diagnosi") mandaDiagnosi(conto);
      else if (lavoro === "approvazioni") mandaApprovazioni(conto);
      else if (lavoro === "esegui") eseguiOperazioni(conto);
      else Logger.log("AZIONE non riconosciuta: \"" + lavoro + "\". Ammesse: metriche, approvazioni, copy, gruppi, asset, diagnosi, esegui, tutto.");
    } catch (e) {
      Logger.log("⚠ ERRORE in \"" + lavoro + "\": " + e);
      RIEPILOGO.push(lavoro + ": ERRORE — " + e);
    }
  }

  Logger.log("");
  Logger.log("──────── RIEPILOGO ────────");
  for (var j = 0; j < RIEPILOGO.length; j++) Logger.log(" · " + RIEPILOGO[j]);
  if (ANTEPRIMA) Logger.log(" · ANTEPRIMA: niente è stato inviato all'app né modificato nell'account.");
}

/**
 * Le richieste lasciate dal bottone "Aggiorna adesso" dell'app. Le serve
 * QUALUNQUE script parta, non solo quello del lavoro chiesto: così basta avere
 * un lavoro schedulato spesso perché "adesso" voglia dire davvero poco.
 */
function serviRichieste(conto) {
  if (ANTEPRIMA) return;
  var risposta = chiamata(
    "get",
    "/api/v1/aggiornamenti?canale=google_ads&account=" + encodeURIComponent(conto.id),
    null
  );
  if (!risposta.ok) return; // l'app non risponde: si va avanti col proprio lavoro
  var richieste = (risposta.dati && risposta.dati.richieste) || [];
  if (richieste.length === 0) return;

  Logger.log("Richieste di aggiornamento dall'app: " + richieste.length);
  var giorniPrima = GIORNI_INDIETRO;
  var copyPrima = GIORNI_COPY;

  for (var i = 0; i < Math.min(richieste.length, 3); i++) {
    if (tempoScaduto()) {
      Logger.log("Tempo quasi finito: le richieste restanti aspettano il prossimo giro.");
      break;
    }
    var r = richieste[i];
    // Stesso ordine del giro normale: qui arriva il bottone "Rifai tutto"
    // dell'app, che è proprio il caso in cui i gruppi servono.
    var lavori = r.lavoro === "tutto" ? LAVORI_LETTURA : [r.lavoro];
    Logger.log("→ eseguo su richiesta: " + r.lavoro + " · ultimi " + r.giorni + " giorni");

    var quante = RIEPILOGO.length;
    var errore = null;
    try {
      GIORNI_INDIETRO = r.giorni;
      GIORNI_COPY = r.giorni;
      for (var j = 0; j < lavori.length; j++) {
        if (lavori[j] === "metriche") mandaMetriche(conto);
        else if (lavori[j] === "copy") mandaCopy(conto);
        else if (lavori[j] === "gruppi") mandaGruppi(conto);
        else if (lavori[j] === "asset") mandaAsset(conto);
        else if (lavori[j] === "diagnosi") mandaDiagnosi(conto);
        else if (lavori[j] === "approvazioni") mandaApprovazioni(conto);
      }
    } catch (e) {
      errore = String(e);
      Logger.log("⚠ richiesta fallita: " + e);
    }
    GIORNI_INDIETRO = giorniPrima;
    GIORNI_COPY = copyPrima;

    // L'esito che si riferisce è quello vero: le righe scritte nel riepilogo
    // durante questa richiesta, non una frase di comodo.
    var fatto = RIEPILOGO.slice(quante).join(" · ") || "nessun dato nel periodo";

    // Se il tempo è finito a metà, la richiesta NON è fatta. Segnarla fatta
    // vorrebbe dire che una richiesta "eseguita" può aver mandato zero gruppi
    // senza che nessuno se ne accorga, a meno di leggere il testo dell'esito.
    // Lasciandola aperta, il prossimo giro riprende da dove si era fermato.
    var interrotto = fatto.indexOf("interrotto per tempo") !== -1;
    if (interrotto) {
      Logger.log("Tempo finito a metà richiesta: la lascio APERTA, il prossimo giro la riprende.");
      RIEPILOGO.push("richiesta " + r.id + ": ripresa al prossimo giro (tempo finito)");
      continue;
    }

    chiamata("post", "/api/v1/aggiornamenti/" + r.id + "/esito", {
      riuscita: !errore,
      dettaglio: errore ? errore : fatto,
    });
  }
}

/** Controlli di sanità prima di partire: meglio fermarsi che sporcare i dati. */
function verificaConfigurazione() {
  while (URL_APP.charAt(URL_APP.length - 1) === "/") URL_APP = URL_APP.slice(0, -1);

  try {
    ANTEPRIMA = AdsApp.getExecutionInfo().isPreview();
  } catch (e) {
    ANTEPRIMA = false;
  }
  if (CHIAVE_API.indexOf("INCOLLA") !== -1) {
    Logger.log("⚠ Chiave API non configurata: giro a vuoto, nel log vedrai i dati che avrei mandato.");
    ANTEPRIMA = true;
  }

  GIORNI_INDIETRO = numeroConfig(GIORNI_INDIETRO, 7, "GIORNI_INDIETRO");
  GIORNI_COPY = numeroConfig(GIORNI_COPY, 30, "GIORNI_COPY");
  LIMITE_BUDGET_X = numeroConfig(LIMITE_BUDGET_X, 3, "LIMITE_BUDGET_X");

  var account = AdsApp.currentAccount();
  var conto = {
    id: account.getCustomerId(),
    nome: account.getName(),
    valuta: account.getCurrencyCode(),
    fuso: account.getTimeZone(),
  };
  Logger.log(
    "Account " + conto.id + " · " + conto.nome + " · " + conto.valuta + " · " + conto.fuso +
    " · azione \"" + AZIONE + "\"" + (ANTEPRIMA ? " · ANTEPRIMA" : "")
  );

  if (conto.valuta !== "EUR") {
    Logger.log("⚠ L'account è in " + conto.valuta + ": l'app tratta la spesa come EURO. Mi fermo.");
    return null;
  }
  if (indiceIn(["", "flowers", "cake", "gifts", "cross"], BRAND) === -1) {
    Logger.log("⚠ BRAND = \"" + BRAND + "\" non è valido (flowers | cake | gifts). Mi fermo.");
    return null;
  }
  if (!BRAND) {
    Logger.log("⚠ BRAND vuoto: l'app proverà a dedurlo dai nomi delle campagne, e quelle che non lo dicono finiranno in \"cross\". Meglio impostarlo.");
  }
  if (AZIONE === "esegui" && !BRAND) {
    Logger.log("⚠ Con AZIONE = \"esegui\" il BRAND serve per capire quali operazioni sono di questo account. Mi fermo.");
    return null;
  }
  return conto;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARTE 1 — METRICHE GIORNALIERE PER CAMPAGNA
   Una riga per campagna e per giorno: spesa, impressioni, clic, conversioni,
   valore. Rimandare gli stessi giorni aggiorna i valori, non li duplica.
   ═══════════════════════════════════════════════════════════════════════════ */

function mandaMetriche(conto) {
  // L'elenco delle campagne prima dei numeri: una campagna ferma non ha giorni
  // da mandare, ma deve comunque comparire nell'app.
  try {
    mandaAnagrafica(conto);
  } catch (e) {
    Logger.log("⚠ Anagrafica non riuscita (" + e + "): proseguo con le metriche.");
  }

  // Le parole cercate davvero: una query sola, e dice dove stanno andando i
  // soldi che nessuna metrica di campagna può mostrare.
  try {
    mandaTermini(conto);
  } catch (e) {
    Logger.log("⚠ Parole cercate non lette (" + e + "): proseguo con le metriche.");
  }

  var stati = INCLUDI_RIMOSSE ? "'ENABLED', 'PAUSED', 'REMOVED'" : "'ENABLED', 'PAUSED'";
  var campiBase =
    "SELECT campaign.id, campaign.name, campaign.status, " +
    "campaign.advertising_channel_type, campaign.bidding_strategy_type, " +
    "campaign_budget.amount_micros, segments.date, " +
    "metrics.cost_micros, metrics.impressions, metrics.clicks, " +
    "metrics.conversions, metrics.conversions_value";
  // La quota impressioni è il dato che dice se la campagna è ferma per soldi
  // finiti o per posizione: due strade opposte. Non tutti i tipi di campagna la
  // espongono, quindi se la query non piace si riprova senza — meglio le
  // metriche senza quota che nessuna metrica.
  var campiQuota =
    ", metrics.search_impression_share, " +
    "metrics.search_budget_lost_impression_share, " +
    "metrics.search_rank_lost_impression_share";
  var coda =
    " FROM campaign " +
    "WHERE segments.date BETWEEN '" + dataIso(-GIORNI_INDIETRO) + "' AND '" + dataIso(0) + "' " +
    "AND campaign.status IN (" + stati + ")";

  var risultati = null;
  var conQuota = true;
  try {
    risultati = AdsApp.search(campiBase + campiQuota + coda);
    risultati.hasNext(); // la prima pagina arriva qui: è qui che Google si lamenta
  } catch (e) {
    // Solo gli errori che parlano DAVVERO della quota giustificano il ripiego:
    // altrimenti si nasconde la causa vera dietro una spiegazione sbagliata.
    var suQuota = String(e).indexOf("impression_share") !== -1 || String(e).indexOf("ImpressionShare") !== -1;
    if (!suQuota) throw e;
    Logger.log("Quota impressioni non disponibile su questo account (" + e + "): proseguo senza.");
    conQuota = false;
    risultati = AdsApp.search(campiBase + coda);
  }

  var righe = [];
  var spesaTotale = 0;
  var perTipo = {};
  while (risultati.hasNext()) {
    var r = risultati.next();
    var spesa = Number(r.metrics.costMicros || 0) / 1000000;
    var budget = Number((r.campaignBudget && r.campaignBudget.amountMicros) || 0) / 1000000;
    spesaTotale += spesa;
    var tipo = r.campaign.advertisingChannelType || "?";
    perTipo[tipo] = (perTipo[tipo] || 0) + 1;

    righe.push({
      idCampagna: String(r.campaign.id),
      nome: r.campaign.name,
      data: r.segments.date, // già AAAA-MM-GG
      spesa: arrotonda(spesa),
      impression: Number(r.metrics.impressions || 0),
      click: Number(r.metrics.clicks || 0),
      conversioni: arrotonda(Number(r.metrics.conversions || 0)),
      ricavi: arrotonda(Number(r.metrics.conversionsValue || 0)),
      stato: statoCampagna(r.campaign.status),
      strategiaOfferta: r.campaign.biddingStrategyType || null,
      budgetGiornaliero: budget > 0 ? arrotonda(budget) : null,
      quotaImpressioni: conQuota ? frazione(r.metrics.searchImpressionShare) : null,
      persaBudget: conQuota ? frazione(r.metrics.searchBudgetLostImpressionShare) : null,
      persaRank: conQuota ? frazione(r.metrics.searchRankLostImpressionShare) : null,
    });
  }

  if (righe.length === 0) {
    Logger.log("Nessuna riga nel periodo " + dataIso(-GIORNI_INDIETRO) + " → " + dataIso(0) + ".");
    RIEPILOGO.push("metriche: nessuna riga");
    return;
  }
  Logger.log(
    righe.length + " righe (giorno×campagna) dal " + dataIso(-GIORNI_INDIETRO) + " al " + dataIso(0) +
    " · spesa totale " + arrotonda(spesaTotale) + " €"
  );
  Logger.log("Tipi di campagna: " + JSON.stringify(perTipo));
  Logger.log("Esempio: " + JSON.stringify(righe[0]));

  var esito = inviaABlocchi("/api/v1/ingest", righe, function (lotto) {
    return corpoBase(conto, { righe: lotto });
  });
  RIEPILOGO.push("metriche: " + esito.inviate + "/" + righe.length + " righe inviate" + (esito.nota ? " · " + esito.nota : ""));
}


/* ═══════════════════════════════════════════════════════════════════════════
   PARTE 1-bis — ANAGRAFICA: LE CAMPAGNE CHE ESISTONO
   La query delle metriche chiede i giorni, e una campagna in pausa da settimane
   non ha giorni: per l'app non esisteva proprio. Ma non si può decidere di
   riattivare una campagna che non si vede. Questa query non nomina le date, e
   quindi torna TUTTE le campagne dell'account, anche quelle a zero.
   ═══════════════════════════════════════════════════════════════════════════ */

function mandaAnagrafica(conto) {
  var stati = INCLUDI_RIMOSSE ? "'ENABLED', 'PAUSED', 'REMOVED'" : "'ENABLED', 'PAUSED'";
  var query =
    "SELECT campaign.id, campaign.name, campaign.status, " +
    "campaign.advertising_channel_type, campaign.bidding_strategy_type, " +
    "campaign_budget.amount_micros " +
    "FROM campaign WHERE campaign.status IN (" + stati + ")";

  var risultati = AdsApp.search(query);
  var righe = [];
  var ferme = 0;
  while (risultati.hasNext()) {
    var r = risultati.next();
    var budget = Number((r.campaignBudget && r.campaignBudget.amountMicros) || 0) / 1000000;
    if (r.campaign.status === "PAUSED") ferme++;
    righe.push({
      idCampagna: String(r.campaign.id),
      nome: r.campaign.name,
      stato: statoCampagna(r.campaign.status),
      budgetGiornaliero: budget > 0 ? arrotonda(budget) : null,
      strategiaOfferta: r.campaign.biddingStrategyType || null,
      tipo: r.campaign.advertisingChannelType || null
    });
  }

  if (righe.length === 0) {
    Logger.log("Anagrafica: nessuna campagna su questo account.");
    return;
  }
  Logger.log("Anagrafica: " + righe.length + " campagne sull'account (" + ferme + " in pausa).");

  var esito = inviaABlocchi("/api/v1/ingest/campagne", righe, function (lotto) {
    return corpoBase(conto, { campagne: lotto });
  });
  RIEPILOGO.push("anagrafica: " + esito.inviate + "/" + righe.length + " campagne" + (esito.nota ? " · " + esito.nota : ""));
}

function statoCampagna(stato) {
  if (stato === "PAUSED") return "in_pausa";
  if (stato === "REMOVED") return "conclusa";
  return "attiva";
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARTE 2 — KEYWORD E TESTI DEGLI ANNUNCI
   Le keyword uguali in più gruppi della stessa campagna vengono SOMMATE: l'app
   tiene una riga per (campagna, keyword) e senza somma vinceva l'ultimo gruppo
   letto, con i numeri di quel gruppo soltanto.
   ═══════════════════════════════════════════════════════════════════════════ */

function mandaCopy(conto) {
  var keywords = leggiKeywords(conto);
  var annunci = leggiAnnunci();

  Logger.log("Keyword (accorpate per campagna): " + keywords.length + " · testi di annuncio: " + annunci.length);
  if (keywords.length > 0) Logger.log("Esempio keyword: " + JSON.stringify(keywords[0]));
  if (annunci.length > 0) Logger.log("Esempio annuncio: " + JSON.stringify(annunci[0]));

  var e1 = inviaABlocchi("/api/v1/ingest/copy", keywords, function (lotto) {
    return corpoBase(conto, { keywords: lotto });
  });
  var e2 = inviaABlocchi("/api/v1/ingest/copy", annunci, function (lotto) {
    return corpoBase(conto, { annunci: lotto });
  });
  RIEPILOGO.push("copy: " + e1.inviate + " keyword e " + e2.inviate + " testi inviati");
}

function leggiKeywords(conto) {
  var query =
    "SELECT campaign.name, ad_group.id, ad_group.name, " +
    "ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, " +
    "ad_group_criterion.keyword.match_type, ad_group_criterion.status, " +
    "ad_group_criterion.quality_info.quality_score, " +
    "metrics.cost_micros, metrics.impressions, metrics.clicks, " +
    "metrics.conversions, metrics.conversions_value " +
    "FROM keyword_view " +
    "WHERE segments.date BETWEEN '" + dataIso(-GIORNI_COPY) + "' AND '" + dataIso(0) + "' " +
    "AND ad_group_criterion.status != 'REMOVED' " +
    // Solo le keyword che nel periodo hanno DAVVERO avuto impressioni. Le altre
    // sono righe a zero: non dicono niente di più dell'assenza, e mandarle
    // costava mille righe per account e il tempo che serviva ai gruppi.
    // Restano visibili in Google Ads, dove è giusto guardarle.
    "AND metrics.impressions > 0";

  var perChiave = {};
  var risultati = AdsApp.search(query);
  while (risultati.hasNext()) {
    var r = risultati.next();
    var c = r.adGroupCriterion;
    var testo = c.keyword.text;
    var match = c.keyword.matchType;
    // Stessa chiave con cui l'app riconosce la riga: campagna + testo + corrispondenza
    var chiave = r.campaign.name + "|" + testo + "|" + match;
    var spesa = Number(r.metrics.costMicros || 0) / 1000000;
    var impressioni = Number(r.metrics.impressions || 0);

    var v = perChiave[chiave];
    if (!v) {
      v = perChiave[chiave] = {
        idEsterno: conto.id + ":" + r.adGroup.id + ":" + c.criterionId,
        testo: testo,
        corrispondenza: match,
        campagna: r.campaign.name,
        gruppi: [],
        spesa: 0, incasso: 0, clic: 0, impressioni: 0, conversioni: 0,
        punteggioQualita: null,
        _spesaMax: -1, _imprMax: -1,
        attiva: false,
      };
    }
    v.spesa += spesa;
    v.incasso += Number(r.metrics.conversionsValue || 0);
    v.clic += Number(r.metrics.clicks || 0);
    v.impressioni += impressioni;
    v.conversioni += Number(r.metrics.conversions || 0);
    if (indiceIn(v.gruppi, r.adGroup.name) === -1) v.gruppi.push(r.adGroup.name);
    if (c.status === "ENABLED") v.attiva = true;
    // L'id mandato all'app è quello del gruppo che spende di più: è il gruppo su
    // cui ha senso agire quando dall'app si mette in pausa la keyword.
    if (spesa > v._spesaMax) {
      v._spesaMax = spesa;
      v.idEsterno = conto.id + ":" + r.adGroup.id + ":" + c.criterionId;
    }
    // Il punteggio di qualità non si somma: si prende quello del gruppo con più impressioni.
    var qs = c.qualityInfo && c.qualityInfo.qualityScore ? Number(c.qualityInfo.qualityScore) : null;
    if (qs != null && impressioni > v._imprMax) {
      v._imprMax = impressioni;
      v.punteggioQualita = qs;
    }
  }

  var righe = [];
  for (var k in perChiave) {
    if (!Object.prototype.hasOwnProperty.call(perChiave, k)) continue;
    var x = perChiave[k];
    righe.push({
      idEsterno: x.idEsterno,
      testo: x.testo,
      corrispondenza: x.corrispondenza, // EXACT | PHRASE | BROAD
      campagna: x.campagna,
      gruppo: elenco(x.gruppi),
      spesa: arrotonda(x.spesa),
      incasso: arrotonda(x.incasso),
      clic: x.clic,
      impressioni: x.impressioni,
      conversioni: arrotonda(x.conversioni),
      punteggioQualita: x.punteggioQualita,
      statoPiattaforma: x.attiva ? "ENABLED" : "PAUSED",
    });
  }
  return righe;
}

/**
 * Titoli e descrizioni degli annunci responsive, con l'etichetta di rendimento
 * che Google assegna a ogni singolo asset (BEST / GOOD / LOW / LEARNING): è il
 * dato che dice quale titolo tira e quale va riscritto.
 * Lo stesso testo compare in più annunci: si tiene una riga per campagna, con
 * l'etichetta migliore vista e, nelle note, quante volte è usato.
 */
function leggiAnnunci() {
  var query =
    "SELECT campaign.name, ad_group.name, ad_group_ad.ad.id, " +
    "asset.text_asset.text, ad_group_ad_asset_view.field_type, " +
    "ad_group_ad_asset_view.performance_label, ad_group_ad.status " +
    "FROM ad_group_ad_asset_view " +
    "WHERE segments.date BETWEEN '" + dataIso(-GIORNI_COPY) + "' AND '" + dataIso(0) + "' " +
    "AND ad_group_ad_asset_view.field_type IN ('HEADLINE', 'DESCRIPTION')";

  var perChiave = {};
  var risultati = AdsApp.search(query);
  while (risultati.hasNext()) {
    var r = risultati.next();
    var testo = r.asset && r.asset.textAsset ? r.asset.textAsset.text : null;
    if (!testo) continue;
    var vista = r.adGroupAdAssetView;
    var tipo = vista.fieldType === "HEADLINE" ? "titolo" : "descrizione";
    var chiave = r.campaign.name + "|" + tipo + "|" + testo;

    var v = perChiave[chiave];
    if (!v) {
      v = perChiave[chiave] = {
        testo: testo, tipo: tipo, campagna: r.campaign.name,
        gruppi: [], usi: 0, rendimento: null, attivo: false,
      };
    }
    v.usi++;
    if (indiceIn(v.gruppi, r.adGroup.name) === -1) v.gruppi.push(r.adGroup.name);
    if (r.adGroupAd.status === "ENABLED") v.attivo = true;
    v.rendimento = migliorRendimento(v.rendimento, vista.performanceLabel);
  }

  var righe = [];
  for (var k in perChiave) {
    if (!Object.prototype.hasOwnProperty.call(perChiave, k)) continue;
    var x = perChiave[k];
    righe.push({
      testo: x.testo,
      tipo: x.tipo,
      campagna: x.campagna,
      gruppo: elenco(x.gruppi),
      rendimento: x.rendimento, // BEST | GOOD | LOW | LEARNING | PENDING
      note: "usato in " + x.usi + " annunc" + (x.usi === 1 ? "io" : "i"),
      statoPiattaforma: x.attivo ? "ENABLED" : "PAUSED",
    });
  }
  return righe;
}

var SCALA_RENDIMENTO = ["PENDING", "LEARNING", "LOW", "GOOD", "BEST"];

function migliorRendimento(a, b) {
  if (!b) return a;
  if (!a) return b;
  return indiceIn(SCALA_RENDIMENTO, b) > indiceIn(SCALA_RENDIMENTO, a) ? b : a;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARTE 3 — GRUPPI DI ANNUNCI (e gruppi di asset delle Performance Max)
   Il gruppo è il livello dove si decide davvero: due gruppi nella stessa
   campagna possono avere rese opposte e la media di campagna li nasconde
   entrambi. Qui ognuno arriva con spesa, clic, conversioni e incasso propri.
   Le PMax non hanno gruppi di annunci: hanno gruppi di ASSET, che si leggono
   da un'altra vista e arrivano con la stessa forma.
   ═══════════════════════════════════════════════════════════════════════════ */

function mandaGruppi(conto) {
  var righe = leggiGruppi(conto).concat(leggiGruppiAsset(conto));
  if (righe.length === 0) {
    Logger.log("Nessun gruppo con dati negli ultimi " + GIORNI_INDIETRO + " giorni.");
    RIEPILOGO.push("gruppi: niente da inviare");
    return;
  }

  Logger.log(
    righe.length + " righe (giorno×gruppo) dal " + dataIso(-GIORNI_INDIETRO) + " al " + dataIso(0)
  );
  Logger.log("Esempio: " + JSON.stringify(righe[0]));

  var esito = inviaABlocchi("/api/v1/ingest", righe, function (lotto) {
    return corpoBase(conto, { gruppi: lotto });
  });
  RIEPILOGO.push("gruppi: " + esito.inviate + "/" + righe.length + " righe inviate" + (esito.nota ? " · " + esito.nota : ""));
}

/**
 * Gruppi di annunci, una riga per giorno come le campagne: solo così l'app può
 * mostrarli su qualunque periodo e confrontarli con la campagna che li contiene.
 * `idCampagna` viaggia insieme: è l'aggancio esatto, il nome è solo il ripiego.
 */
function leggiGruppi(conto) {
  var query =
    "SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, " +
    "ad_group.status, ad_group.type, segments.date, " +
    "metrics.cost_micros, metrics.impressions, metrics.clicks, " +
    "metrics.conversions, metrics.conversions_value " +
    "FROM ad_group " +
    "WHERE segments.date BETWEEN '" + dataIso(-GIORNI_INDIETRO) + "' AND '" + dataIso(0) + "' " +
    "AND ad_group.status != 'REMOVED'";

  var righe = [];
  // Il try copre anche il ciclo: AdsApp.search carica le pagine man mano, così
  // un errore può arrivare a metà lettura e non solo sulla query.
  try {
    var risultati = AdsApp.search(query);
    while (risultati.hasNext()) {
      var r = risultati.next();
      righe.push({
        idGruppo: conto.id + ":" + r.adGroup.id,
        nome: r.adGroup.name,
        idCampagna: String(r.campaign.id),
        campagna: r.campaign.name,
        data: r.segments.date,
        spesa: arrotonda(Number(r.metrics.costMicros || 0) / 1000000),
        impression: Number(r.metrics.impressions || 0),
        click: Number(r.metrics.clicks || 0),
        conversioni: arrotonda(Number(r.metrics.conversions || 0)),
        ricavi: arrotonda(Number(r.metrics.conversionsValue || 0)),
        statoPiattaforma: r.adGroup.status,
        tipo: r.adGroup.type ? String(r.adGroup.type).toLowerCase() : null,
      });
    }
  } catch (e) {
    Logger.log("Lettura dei gruppi di annunci interrotta: " + e + (righe.length ? " (tengo le " + righe.length + " righe già lette)" : ""));
  }
  return righe;
}

/** Performance Max: gruppi di asset, stessa forma, con la loro etichetta. */
function leggiGruppiAsset(conto) {
  var query =
    "SELECT campaign.id, campaign.name, asset_group.id, asset_group.name, " +
    "asset_group.status, segments.date, " +
    "metrics.cost_micros, metrics.impressions, metrics.clicks, " +
    "metrics.conversions, metrics.conversions_value " +
    "FROM asset_group " +
    "WHERE segments.date BETWEEN '" + dataIso(-GIORNI_INDIETRO) + "' AND '" + dataIso(0) + "' " +
    "AND asset_group.status != 'REMOVED'";

  var righe = [];
  try {
    var risultati = AdsApp.search(query);
    while (risultati.hasNext()) {
      var r = risultati.next();
      righe.push({
        idGruppo: conto.id + ":ag:" + r.assetGroup.id,
        nome: r.assetGroup.name,
        idCampagna: String(r.campaign.id),
        campagna: r.campaign.name,
        data: r.segments.date,
        spesa: arrotonda(Number(r.metrics.costMicros || 0) / 1000000),
        impression: Number(r.metrics.impressions || 0),
        click: Number(r.metrics.clicks || 0),
        conversioni: arrotonda(Number(r.metrics.conversions || 0)),
        ricavi: arrotonda(Number(r.metrics.conversionsValue || 0)),
        statoPiattaforma: r.assetGroup.status,
        tipo: "asset_group_pmax",
      });
    }
  } catch (e) {
    // Account senza PMax, o vista non disponibile: non è un errore.
    Logger.log("Gruppi di asset (PMax) non letti: " + e);
  }
  return righe;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARTE 4 — DIAGNOSI: TERMINI DI RICERCA E SPARTIZIONE DELLA SPESA
   I totali di campagna dicono COME è andata, non PERCHÉ. Qui si prende quello
   che le persone hanno digitato davvero (che è diverso da quello che abbiamo
   comprato) e come si spartisce la spesa fra dispositivi, giorni e reti.
   Sono dati per PERIODO, non per giorno: l'app li sostituisce a ogni passata
   invece di sommarli.
   ═══════════════════════════════════════════════════════════════════════════ */

var MAX_TERMINI = 300; // i più costosi: oltre non si guarda mai nessuno

function mandaDiagnosi(conto) {
  mandaTermini(conto);

  var segmenti = []
    .concat(leggiSegmento("segments.device", "dispositivo"))
    .concat(leggiSegmento("segments.day_of_week", "giorno"))
    .concat(leggiSegmento("segments.ad_network_type", "rete"));

  Logger.log("Righe di segmento: " + segmenti.length);
  var e2 = inviaABlocchi("/api/v1/ingest/diagnosi", segmenti, function (lotto) {
    return corpoBase(conto, { segmenti: lotto });
  });
  RIEPILOGO.push("segmenti: " + e2.inviate + " righe inviate");
}

/**
 * Le PAROLE CERCATE DAVVERO: quello che le persone hanno digitato, che è una
 * cosa diversa da quello che abbiamo comprato. È il dato che fa scoprire la
 * ricerca costosa a cui non avevamo pensato — e le negative da aggiungere.
 *
 * Parte insieme alle metriche di tutti i giorni, non solo con "diagnosi": è una
 * query sola con i 300 termini più costosi, costa pochi secondi, e aspettare il
 * giro settimanale vuol dire accorgersi di una settimana di spesa a vuoto una
 * settimana dopo.
 */
function mandaTermini(conto) {
  if (TERMINI_INVIATI) return; // già mandati in questo giro
  var termini = leggiTerminiRicerca();
  if (termini.length === 0) {
    Logger.log("Parole cercate: nessuna nel periodo.");
    return;
  }

  var senzaConversioni = 0;
  var spesaSprecata = 0;
  for (var i = 0; i < termini.length; i++) {
    if (!termini[i].conversioni && termini[i].spesa > 0) {
      senzaConversioni++;
      spesaSprecata += termini[i].spesa;
    }
  }
  Logger.log(
    "Parole cercate: " + termini.length + " · " + senzaConversioni +
    " hanno speso senza convertire, per " + arrotonda(spesaSprecata) + " € in tutto"
  );
  Logger.log("  la più cara: " + JSON.stringify(termini[0]));

  var esito = inviaABlocchi("/api/v1/ingest/diagnosi", termini, function (lotto) {
    return corpoBase(conto, { terminiRicerca: lotto });
  });
  TERMINI_INVIATI = true;
  RIEPILOGO.push("parole cercate: " + esito.inviate + "/" + termini.length + " inviate");
}

/**
 * Quello che la gente ha digitato per davvero. Si tengono i più costosi: sono
 * quelli su cui una decisione cambia i soldi. Le PMax non espongono i termini.
 *
 * ⚠️ I numeri sono della PAROLA CERCATA, non della keyword: la keyword qui è un
 * segmento della riga, cioè l'etichetta di chi ha fatto scattare quella ricerca.
 *
 * ⚠️ E proprio per questo Google manda una riga per ogni coppia (parola ×
 * keyword): la stessa ricerca intercettata da due keyword arriva due volte, con
 * la spesa spezzata in due. L'app tiene una riga per (campagna, testo), quindi
 * senza somma vinceva l'ultima letta e la parola sembrava costare la metà.
 * È la stessa trappola già pagata sulle keyword (vedi PARTE 2): si somma qui,
 * prima di spedire, e si dice da quante keyword è arrivata.
 */
function leggiTerminiRicerca() {
  var dal = dataIso(-GIORNI_COPY);
  var al = dataIso(0);
  var query =
    "SELECT campaign.id, campaign.name, ad_group.name, " +
    "search_term_view.search_term, search_term_view.status, " +
    "segments.keyword.info.text, segments.keyword.info.match_type, " +
    "metrics.cost_micros, metrics.impressions, metrics.clicks, " +
    "metrics.conversions, metrics.conversions_value " +
    "FROM search_term_view " +
    "WHERE segments.date BETWEEN '" + dal + "' AND '" + al + "' " +
    "ORDER BY metrics.cost_micros DESC " +
    "LIMIT " + MAX_TERMINI;

  var per = {};
  var ordine = [];
  try {
    var risultati = AdsApp.search(query);
    while (risultati.hasNext()) {
      var r = risultati.next();
      var kw = r.segments && r.segments.keyword && r.segments.keyword.info ? r.segments.keyword.info : null;
      var idCampagna = String(r.campaign.id);
      var testo = r.searchTermView.searchTerm;
      var chiave = idCampagna + " " + testo;
      var spesa = Number(r.metrics.costMicros || 0) / 1000000;

      var v = per[chiave];
      if (!v) {
        v = {
          idCampagna: idCampagna,
          campagna: r.campaign.name,
          gruppo: r.adGroup ? r.adGroup.name : null,
          testo: testo,
          keyword: null,
          corrispondenza: null,
          keywordDiverse: 0,
          spesa: 0,
          clic: 0,
          impressioni: 0,
          conversioni: 0,
          ricavi: 0,
          dal: dal,
          al: al,
          _spesaMax: -1,
        };
        per[chiave] = v;
        ordine.push(chiave);
      }
      v.spesa += spesa;
      v.clic += Number(r.metrics.clicks || 0);
      v.impressioni += Number(r.metrics.impressions || 0);
      v.conversioni += Number(r.metrics.conversions || 0);
      v.ricavi += Number(r.metrics.conversionsValue || 0);
      if (kw && kw.text) v.keywordDiverse++;
      // La keyword mostrata è quella che ha speso di più su questa ricerca: è
      // quella su cui ha senso agire se la parola va esclusa o cavalcata.
      if (kw && spesa > v._spesaMax) {
        v._spesaMax = spesa;
        v.keyword = kw.text;
        v.corrispondenza = kw.matchType;
        v.gruppo = r.adGroup ? r.adGroup.name : v.gruppo;
      }
    }
  } catch (e) {
    Logger.log("Termini di ricerca non letti: " + e);
  }

  var righe = [];
  for (var i = 0; i < ordine.length; i++) {
    var x = per[ordine[i]];
    delete x._spesaMax;
    x.spesa = arrotonda(x.spesa);
    x.conversioni = arrotonda(x.conversioni);
    x.ricavi = arrotonda(x.ricavi);
    righe.push(x);
  }
  // Si riordina per spesa: il LIMIT della query lavorava sulle righe spezzate,
  // dopo la somma l'ordine può cambiare.
  righe.sort(function (a, b) { return b.spesa - a.spesa; });
  return righe;
}

/** Spesa e resa per dispositivo, giorno della settimana o rete. */
function leggiSegmento(campo, tipo) {
  var dal = dataIso(-GIORNI_COPY);
  var al = dataIso(0);
  var query =
    "SELECT campaign.id, campaign.name, " + campo + ", " +
    "metrics.cost_micros, metrics.impressions, metrics.clicks, " +
    "metrics.conversions, metrics.conversions_value " +
    "FROM campaign " +
    "WHERE segments.date BETWEEN '" + dal + "' AND '" + al + "' " +
    "AND campaign.status IN ('ENABLED', 'PAUSED')";

  // "segments.device" → r.segments.device
  var proprieta = campo.split(".")[1].split("_");
  var nome = proprieta[0];
  for (var i = 1; i < proprieta.length; i++) {
    nome += proprieta[i].charAt(0).toUpperCase() + proprieta[i].slice(1);
  }

  var righe = [];
  try {
    var risultati = AdsApp.search(query);
    while (risultati.hasNext()) {
      var r = risultati.next();
      var valore = r.segments ? r.segments[nome] : null;
      if (!valore) continue;
      var spesa = Number(r.metrics.costMicros || 0) / 1000000;
      var clic = Number(r.metrics.clicks || 0);
      if (spesa === 0 && clic === 0) continue; // righe vuote: solo rumore
      righe.push({
        idCampagna: String(r.campaign.id),
        campagna: r.campaign.name,
        tipo: tipo,
        valore: String(valore),
        spesa: arrotonda(spesa),
        clic: clic,
        impressioni: Number(r.metrics.impressions || 0),
        conversioni: arrotonda(Number(r.metrics.conversions || 0)),
        ricavi: arrotonda(Number(r.metrics.conversionsValue || 0)),
        dal: dal,
        al: al,
      });
    }
  } catch (e) {
    Logger.log("Segmento " + tipo + " non letto: " + e);
  }
  return righe;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARTE 5 — ASSET: SITELINK, CALLOUT, SNIPPET, IMMAGINI
   Gli asset stanno su tre livelli: account, campagna e gruppo di annunci.
   Lo stesso sitelink agganciato su più livelli è UNA riga per l'app: qui i
   livelli si accorpano in un'unica voce ("campagna + gruppo") invece di
   sovrascriversi a vicenda, e gli asset di account portano l'id dell'account
   nel nome della "campagna", così tre account non si sovrascrivono fra loro.
   ═══════════════════════════════════════════════════════════════════════════ */

function mandaAsset(conto) {
  var grezzi = []
    .concat(leggiAsset(conto, "customer_asset", "account"))
    .concat(leggiAsset(conto, "campaign_asset", "campagna"))
    .concat(leggiAsset(conto, "ad_group_asset", "gruppo"));

  var righe = accorpaAsset(grezzi);
  Logger.log("Asset letti: " + grezzi.length + " → righe accorpate: " + righe.length);
  var perTipo = {};
  for (var i = 0; i < righe.length; i++) {
    var k = righe[i].tipo + " @ " + righe[i].livello;
    perTipo[k] = (perTipo[k] || 0) + 1;
  }
  Logger.log("Riepilogo: " + JSON.stringify(perTipo));
  if (righe.length > 0) Logger.log("Esempio: " + JSON.stringify(righe[0]));

  var esito = inviaABlocchi("/api/v1/ingest/copy", righe, function (lotto) {
    return corpoBase(conto, { annunci: lotto });
  });
  var quantiNumeri = 0, spesaTot = 0, piuCaro = null;
  for (var n = 0; n < righe.length; n++) {
    if (righe[n].spesa != null) {
      quantiNumeri++;
      spesaTot += righe[n].spesa;
      if (!piuCaro || righe[n].spesa > piuCaro.spesa) piuCaro = righe[n];
    }
  }
  if (quantiNumeri > 0) {
    Logger.log("Asset con numeri: " + quantiNumeri + "/" + righe.length + " - spesa totale " + arrotonda(spesaTot) + " EUR su " + GIORNI_ASSET + " giorni");
    if (piuCaro) Logger.log("  il piu' caro: \"" + piuCaro.testo + "\" (" + piuCaro.tipo + ") " + piuCaro.spesa + " EUR, " + piuCaro.clic + " clic, incasso " + piuCaro.incasso);
  } else {
    Logger.log("ATTENZIONE: nessun asset ha numeri. La query e' ripiegata sull'anagrafica: nell'app resteranno senza spesa e senza clic.");
  }
  RIEPILOGO.push("asset: " + esito.inviate + "/" + righe.length + " righe inviate - " + quantiNumeri + " con numeri");
}

function leggiAsset(conto, vista, livello) {
  var righe = [];
  var campiContesto =
    vista === "campaign_asset" ? "campaign.name, " :
    vista === "ad_group_asset" ? "campaign.name, ad_group.name, " : "";

  var campiAsset =
    "SELECT " + campiContesto + vista + ".status, asset.id, asset.type, asset.name, " +
    "asset.sitelink_asset.link_text, asset.sitelink_asset.description1, " +
    "asset.sitelink_asset.description2, asset.final_urls, " +
    "asset.callout_asset.callout_text, " +
    "asset.structured_snippet_asset.header, asset.structured_snippet_asset.values, " +
    "asset.image_asset.full_size.url, asset.image_asset.full_size.width_pixels, " +
    "asset.image_asset.full_size.height_pixels";

  // I numeri dell'asset. Senza segments.date nella SELECT, Google aggrega tutto
  // il periodo in una riga sola per asset: e' esattamente quello che serve per
  // dire "questo sitelink ha reso tanto negli ultimi N giorni". Con la data
  // nella SELECT arriverebbe una riga per giorno, da sommare a mano.
  var campiNumeri =
    ", metrics.cost_micros, metrics.impressions, metrics.clicks, " +
    "metrics.conversions, metrics.conversions_value";

  var coda =
    " FROM " + vista + " " +
    "WHERE " + vista + ".status != 'REMOVED' " +
    "AND asset.type IN ('SITELINK', 'CALLOUT', 'STRUCTURED_SNIPPET', 'IMAGE')";
  var codaConData =
    coda + " AND segments.date BETWEEN '" + dataIso(-GIORNI_ASSET) + "' AND '" + dataIso(0) + "'";

  var campoVista = vista === "customer_asset" ? "customerAsset"
    : vista === "campaign_asset" ? "campaignAsset" : "adGroupAsset";

  // Prima si prova con i numeri. Se la vista non li regge (customer_asset
  // spesso no) si torna all'anagrafica sola, DICENDOLO: un ripiego muto
  // farebbe credere che quell'asset non abbia speso niente.
  var risultati = null;
  var conNumeri = true;
  try {
    risultati = AdsApp.search(campiAsset + campiNumeri + codaConData);
    risultati.hasNext(); // la prima pagina arriva qui: e' qui che Google si lamenta
  } catch (e) {
    Logger.log("Vista " + vista + ": numeri non disponibili (" + e + "). Leggo la sola anagrafica.");
    conNumeri = false;
    try {
      risultati = AdsApp.search(campiAsset + coda);
      risultati.hasNext();
    } catch (e2) {
      Logger.log("Vista " + vista + " non letta affatto: " + e2);
      return righe;
    }
  }

  try {
    while (risultati.hasNext()) {
      var r = risultati.next();
      var a = r.asset;
      var contesto = r[campoVista] || {};
      var m = r.metrics || {};
      var riga = {
        idEsterno: conto.id + ":" + a.id,
        campagna: (r.campaign && r.campaign.name) || "(account " + conto.id + ")",
        gruppo: (r.adGroup && r.adGroup.name) || null,
        livello: livello,
        statoPiattaforma: contesto.status || "ENABLED",
        spesa: conNumeri ? arrotonda(Number(m.costMicros || 0) / 1000000) : null,
        incasso: conNumeri ? arrotonda(Number(m.conversionsValue || 0)) : null,
        clic: conNumeri ? Number(m.clicks || 0) : null,
        impressioni: conNumeri ? Number(m.impressions || 0) : null,
        conversioni: conNumeri ? arrotonda(Number(m.conversions || 0)) : null,
      };

      if (a.type === "SITELINK" && a.sitelinkAsset) {
        riga.tipo = "sitelink";
        riga.testo = a.sitelinkAsset.linkText;
        riga.note = filtraVuoti([a.sitelinkAsset.description1, a.sitelinkAsset.description2]).join(" - ");
        riga.finalUrl = a.finalUrls && a.finalUrls.length ? a.finalUrls[0] : null;
      } else if (a.type === "CALLOUT" && a.calloutAsset) {
        riga.tipo = "callout";
        riga.testo = a.calloutAsset.calloutText;
      } else if (a.type === "STRUCTURED_SNIPPET" && a.structuredSnippetAsset) {
        riga.tipo = "snippet";
        riga.testo = a.structuredSnippetAsset.header;
        riga.note = (a.structuredSnippetAsset.values || []).join(" - ");
      } else if (a.type === "IMAGE" && a.imageAsset) {
        riga.tipo = "immagine";
        riga.testo = a.name || ("Immagine " + a.id);
        var dim = a.imageAsset.fullSize;
        riga.anteprima = dim ? dim.url : null;
        riga.note = dim ? dim.widthPixels + "x" + dim.heightPixels : null;
      } else {
        continue;
      }
      if (!riga.testo) continue;
      righe.push(riga);
    }
  } catch (e3) {
    Logger.log("Vista " + vista + " interrotta a meta': " + e3 + (righe.length ? " (tengo le " + righe.length + " righe gia' lette)" : ""));
  }
  return righe;
}

/** Una riga per (tipo, testo, campagna): è la chiave con cui l'app le riconosce. */
function accorpaAsset(grezzi) {
  var perChiave = {};
  var ordine = [];
  for (var i = 0; i < grezzi.length; i++) {
    var g = grezzi[i];
    var chiave = g.tipo + "|" + g.testo + "|" + g.campagna;
    var v = perChiave[chiave];
    if (!v) {
      g.livelli = [g.livello];
      g.gruppi = g.gruppo ? [g.gruppo] : [];
      perChiave[chiave] = g;
      ordine.push(chiave);
      continue;
    }
    if (indiceIn(v.livelli, g.livello) === -1) v.livelli.push(g.livello);
    if (g.gruppo && indiceIn(v.gruppi, g.gruppo) === -1) v.gruppi.push(g.gruppo);
    if (g.statoPiattaforma === "ENABLED") v.statoPiattaforma = "ENABLED";
    if (!v.finalUrl && g.finalUrl) v.finalUrl = g.finalUrl;
    // Campagna e gruppo sono due agganci distinti dello stesso asset, ognuno
    // coi suoi numeri: il totale dell'asset e' la loro somma. Gli asset di
    // livello ACCOUNT non finiscono qui (la loro "campagna" e' "(account NNN)"),
    // quindi non si contano due volte.
    v.spesa = sommaSeCe(v.spesa, g.spesa);
    v.incasso = sommaSeCe(v.incasso, g.incasso);
    v.clic = sommaSeCe(v.clic, g.clic);
    v.impressioni = sommaSeCe(v.impressioni, g.impressioni);
    v.conversioni = sommaSeCe(v.conversioni, g.conversioni);
  }

  var righe = [];
  for (var j = 0; j < ordine.length; j++) {
    var x = perChiave[ordine[j]];
    x.livello = x.livelli.join(" + ");
    x.gruppo = x.gruppi.length ? elenco(x.gruppi) : null;
    delete x.livelli;
    delete x.gruppi;
    righe.push(x);
  }
  return righe;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARTE 6 — STATO DI APPROVAZIONE DEGLI ANNUNCI (alert A4)
   Il doc 11 §4 chiede di controllare se più del 50% degli annunci attivi è in
   revisione o limitato. È l'unico alert che non si legge dalle metriche.
   (Limite noto: Google non dice DA QUANTO un annuncio è in revisione; il "da
   oltre 24 ore" si ricava confrontando i conteggi di giorni diversi.)
   ═══════════════════════════════════════════════════════════════════════════ */

function mandaApprovazioni(conto) {
  var perCampagna = leggiApprovazioni();
  var righe = [];
  for (var nome in perCampagna) {
    if (!Object.prototype.hasOwnProperty.call(perCampagna, nome)) continue;
    righe.push({
      idCampagna: perCampagna[nome].id,
      nome: nome,
      data: dataIso(0), // i conteggi sono istantanei: valgono oggi
      annunciTotali: perCampagna[nome].totali,
      annunciInReview: perCampagna[nome].inReview,
    });
  }

  Logger.log("Campagne attive con annunci: " + righe.length);
  var conProblemi = 0;
  for (var i = 0; i < righe.length; i++) {
    if (righe[i].annunciInReview > 0) {
      conProblemi++;
      Logger.log("  " + righe[i].nome + ": " + righe[i].annunciInReview + "/" + righe[i].annunciTotali + " in revisione o limitati");
    }
  }
  if (righe.length === 0) {
    RIEPILOGO.push("approvazioni: nessuna campagna attiva con annunci");
    return;
  }

  var esito = inviaABlocchi("/api/v1/ingest", righe, function (lotto) {
    return corpoBase(conto, { righe: lotto });
  });
  RIEPILOGO.push("approvazioni: " + esito.inviate + " campagne inviate · " + conProblemi + " con annunci in revisione");
}

/**
 * approvalStatus: APPROVED | APPROVED_LIMITED | AREA_OF_INTEREST_ONLY | DISAPPROVED
 * reviewStatus:   REVIEW_IN_PROGRESS | REVIEWED | UNDER_APPEAL
 */
function leggiApprovazioni() {
  var perCampagna = {};
  var query =
    "SELECT campaign.id, campaign.name, ad_group_ad.ad.id, " +
    "ad_group_ad.policy_summary.approval_status, " +
    "ad_group_ad.policy_summary.review_status " +
    "FROM ad_group_ad " +
    "WHERE ad_group_ad.status = 'ENABLED' AND campaign.status = 'ENABLED'";

  try {
    var risultati = AdsApp.search(query);
    while (risultati.hasNext()) {
      var r = risultati.next();
      var nome = r.campaign.name;
      if (!perCampagna[nome]) perCampagna[nome] = { id: String(r.campaign.id), totali: 0, inReview: 0 };
      perCampagna[nome].totali++;
      var ps = r.adGroupAd.policySummary || {};
      var limitato =
        ps.approvalStatus === "APPROVED_LIMITED" ||
        ps.approvalStatus === "AREA_OF_INTEREST_ONLY" ||
        ps.approvalStatus === "DISAPPROVED";
      var inEsame = ps.reviewStatus === "REVIEW_IN_PROGRESS" || ps.reviewStatus === "UNDER_APPEAL";
      if (limitato || inEsame) perCampagna[nome].inReview++;
    }
  } catch (e) {
    // Meglio niente conteggi che conteggi a metà: l'alert A4 li confronta fra giorni.
    Logger.log("Impossibile leggere gli stati di approvazione: " + e);
    return {};
  }
  return perCampagna;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARTE 7 — ESECUZIONE DELLE OPERAZIONI APPROVATE (scrittura)
   Questo script SCRIVE su Google Ads, ma solo ciò che è stato approvato a mano
   nell'app. Non decide nulla da sé. Se l'app non risponde, non fa niente.
   Con più account la coda è comune: ogni script esegue SOLO ciò che riguarda
   il suo account e SALTA il resto senza segnarlo fallito.
   ═══════════════════════════════════════════════════════════════════════════ */

function eseguiOperazioni(conto) {
  var risposta = chiamata("get", "/api/v1/operazioni?canale=google_ads", null);
  if (!risposta.ok) {
    Logger.log("L'app non risponde (HTTP " + risposta.codice + "): non eseguo nulla. " + risposta.testo);
    RIEPILOGO.push("esegui: app non raggiungibile");
    return;
  }
  var operazioni = (risposta.dati && risposta.dati.operazioni) || [];
  if (operazioni.length === 0) {
    Logger.log("Nessuna operazione approvata in coda.");
    RIEPILOGO.push("esegui: niente in coda");
    return;
  }
  Logger.log("Operazioni approvate in coda (tutti gli account): " + operazioni.length);

  var fatte = 0, fallite = 0, saltate = 0;
  for (var i = 0; i < operazioni.length; i++) {
    if (tempoScaduto()) {
      Logger.log("Tempo quasi finito: mi fermo, le restanti restano in coda.");
      break;
    }
    var op = operazioni[i];
    op.parametri = op.parametri || {};

    // 1. È di questo account?
    if (op.account && soloCifre(op.account) !== soloCifre(conto.id)) {
      saltate++;
      continue;
    }

    // 2. Il bersaglio esiste in questo account?
    var mira;
    try {
      mira = trovaBersaglio(op, conto);
    } catch (e) {
      Logger.log("SALTO " + op.tipo + " su " + op.bersaglio + " — " + e);
      saltate++;
      continue;
    }
    if (mira.esito === "altro-account") {
      saltate++;
      continue;
    }
    if (mira.esito === "non-trovato") {
      if (op.account) {
        // L'app dice che è di questo account e non c'è: è un errore vero.
        Logger.log("ERRORE " + op.tipo + ": bersaglio non trovato — " + op.bersaglio);
        fallite++;
        if (!riferisci(op, false, "Bersaglio non trovato in questo account: " + op.bersaglio, null, null)) break;
      } else {
        Logger.log("Salto " + op.tipo + " su \"" + op.bersaglio + "\": non è in questo account.");
        saltate++;
      }
      continue;
    }

    // 3. Esecuzione
    if (ANTEPRIMA) {
      Logger.log("ANTEPRIMA — eseguirei: " + op.tipo + " su " + op.bersaglio + " " + JSON.stringify(op.parametri));
      saltate++;
      continue;
    }
    try {
      var esito = applica(op, mira, conto);
      Logger.log("OK " + op.tipo + " su " + op.bersaglio + " — " + esito.dettaglio);
      fatte++;
      // Se l'app non registra l'esito ci si ferma: rifarla al giro dopo
      // significherebbe una seconda negativa, keyword o campagna.
      if (!riferisci(op, true, esito.dettaglio, esito.prima, esito.dopo)) break;
    } catch (e2) {
      Logger.log("ERRORE " + op.tipo + " su " + op.bersaglio + " — " + e2);
      fallite++;
      if (!riferisci(op, false, String(e2), null, null)) break;
    }
  }
  RIEPILOGO.push("esegui: " + fatte + " eseguite · " + fallite + " fallite · " + saltate + " saltate (altri account o anteprima)");
}

/**
 * Trova l'oggetto su cui agire. Restituisce {esito, campagna?, keyword?}:
 * "trovato" · "non-trovato" · "altro-account" (da saltare in silenzio).
 */
function trovaBersaglio(op, conto) {
  var t = op.tipo;

  if (t === "nuova_campagna") {
    // Non c'è ancora niente da trovare: si decide dal brand del nome.
    var nome = op.parametri.nome || op.bersaglio;
    if (op.account) return { esito: "trovato" };
    var b = brandDa(nome);
    if (b === BRAND) return { esito: "trovato" };
    if (b === "cross" && ACCETTA_CAMPAGNE_SENZA_BRAND) return { esito: "trovato" };
    Logger.log(
      "Salto la creazione di \"" + nome + "\": il nome non dice \"" + BRAND + "\". " +
      "Se va creata qui, indica l'account nell'operazione o metti ACCETTA_CAMPAGNE_SENZA_BRAND = true."
    );
    return { esito: "altro-account" };
  }

  if (t === "pausa_keyword" || t === "attiva_keyword") return trovaKeyword(op, conto);
  if (t === "pausa_gruppo" || t === "attiva_gruppo") return trovaGruppo(op, conto);

  var campagna = trovaCampagna(op);
  return campagna ? { esito: "trovato", campagna: campagna } : { esito: "non-trovato" };
}

/** Cerca fra Search/Display, Performance Max, Shopping e Video. */
function trovaCampagna(op) {
  var selettori = [];
  aggiungiSelettore(selettori, function () { return AdsApp.campaigns(); });
  aggiungiSelettore(selettori, function () { return AdsApp.performanceMaxCampaigns(); });
  aggiungiSelettore(selettori, function () { return AdsApp.shoppingCampaigns(); });
  aggiungiSelettore(selettori, function () { return AdsApp.videoCampaigns(); });

  for (var i = 0; i < selettori.length; i++) {
    try {
      var sel = op.idEsterno
        ? selettori[i].withIds([Number(op.idEsterno)])
        : selettori[i].withCondition("campaign.name = '" + apici(op.bersaglio) + "'");
      var it = sel.get();
      if (it.hasNext()) return it.next();
    } catch (e) {
      // tipo di campagna non supportato da questo selettore: passo al prossimo
    }
  }
  return null;
}

function aggiungiSelettore(lista, fabbrica) {
  try {
    lista.push(fabbrica());
  } catch (e) {
    // selettore non disponibile in questa versione degli Scripts
  }
}

/**
 * L'id delle keyword mandato dalla v2 è "account:gruppo:criterio": si ritrova in
 * modo esatto e si capisce subito se è di un altro account. Le righe vecchie
 * hanno solo il numero del criterio: lì si cerca per testo, e se il risultato è
 * ambiguo non si tocca niente.
 */
function trovaKeyword(op, conto) {
  var parti = String(op.idEsterno || "").split(":");
  if (parti.length === 3) {
    if (soloCifre(parti[0]) !== soloCifre(conto.id)) return { esito: "altro-account" };
    var it = AdsApp.keywords().withIds([[Number(parti[1]), Number(parti[2])]]).get();
    return it.hasNext() ? { esito: "trovato", keyword: it.next() } : { esito: "non-trovato" };
  }

  var testo = op.parametri.testo || op.bersaglio;
  var pulito = String(testo).replace(/\s*\((broad|phrase|exact|esatta|frase)\)\s*$/i, "");
  var trovate = [];
  var iter = AdsApp.keywords()
    .withCondition("ad_group_criterion.keyword.text = '" + apici(pulito) + "'")
    .withCondition("ad_group_criterion.status != 'REMOVED'")
    .get();
  while (iter.hasNext()) {
    var kw = iter.next();
    if (BRAND && brandDa(kw.getCampaign().getName()) !== BRAND) continue;
    trovate.push(kw);
  }
  if (trovate.length === 0) return { esito: "non-trovato" };
  if (trovate.length > 1) {
    throw new Error(
      "\"" + pulito + "\" esiste in " + trovate.length + " gruppi: non tocco niente. " +
      "Rilancia lo script \"copy\" per aggiornare gli id, poi riaccoda l'operazione."
    );
  }
  return { esito: "trovato", keyword: trovate[0] };
}

/**
 * L'id dei gruppi è "account:idGruppo" (o "account:ag:id" per i gruppi di asset
 * delle PMax, che dagli Script non si toccano). Il prefisso dice subito se
 * l'operazione è di un altro account.
 */
function trovaGruppo(op, conto) {
  var parti = String(op.idEsterno || "").split(":");
  if (parti.length >= 2 && soloCifre(parti[0]) !== soloCifre(conto.id)) {
    return { esito: "altro-account" };
  }
  if (parti.length === 3 && parti[1] === "ag") {
    throw new Error(
      "È un gruppo di asset di una Performance Max: dagli Script non si può fermare. " +
      "Va fatto nell'interfaccia di Google Ads."
    );
  }
  if (parti.length !== 2) {
    // Riga vecchia senza account nell'id: si cerca per nome, ma solo dentro la
    // campagna indicata, altrimenti si rischia il gruppo omonimo di un'altra.
    var nomeCampagna = (op.parametri && op.parametri.campagna) || null;
    if (!nomeCampagna) return { esito: "non-trovato" };
    var campagna = trovaCampagna({ bersaglio: nomeCampagna });
    if (!campagna) return { esito: "non-trovato" };
    var perNome = campagna.adGroups()
      .withCondition("ad_group.name = '" + apici(op.bersaglio) + "'")
      .get();
    return perNome.hasNext() ? { esito: "trovato", gruppo: perNome.next() } : { esito: "non-trovato" };
  }
  var it = AdsApp.adGroups().withIds([Number(parti[1])]).get();
  return it.hasNext() ? { esito: "trovato", gruppo: it.next() } : { esito: "non-trovato" };
}

/** Esegue davvero. Ogni ramo legge lo stato PRIMA di cambiarlo. */
function applica(op, mira, conto) {
  var t = op.tipo;

  if (t === "pausa_campagna") {
    var eraAttiva = mira.campagna.isEnabled();
    mira.campagna.pause();
    return { dettaglio: "campagna messa in pausa", prima: eraAttiva ? "attiva" : "già in pausa", dopo: "in pausa" };
  }

  if (t === "attiva_campagna") {
    var eraPausa = mira.campagna.isPaused();
    mira.campagna.enable();
    return { dettaglio: "campagna riattivata", prima: eraPausa ? "in pausa" : "già attiva", dopo: "attiva" };
  }

  if (t === "budget") {
    var nuovo = Number(op.parametri.budget);
    if (!nuovo || nuovo <= 0) throw new Error("Budget non valido: " + op.parametri.budget);
    if (budgetCondiviso(mira.campagna)) {
      throw new Error("Il budget di questa campagna è CONDIVISO con altre: cambiarlo qui le toccherebbe tutte. Da fare a mano in interfaccia.");
    }
    var budget = mira.campagna.getBudget();
    var vecchio = budget.getAmount();
    if (vecchio > 0 && (nuovo > vecchio * LIMITE_BUDGET_X || nuovo < vecchio / LIMITE_BUDGET_X)) {
      throw new Error(
        "Salto di budget sospetto: da " + vecchio + " a " + nuovo + " €/g (limite ×" + LIMITE_BUDGET_X + "). " +
        "Se è voluto, alza LIMITE_BUDGET_X o fallo a mano."
      );
    }
    budget.setAmount(nuovo);
    return {
      dettaglio: "budget " + vecchio + " → " + nuovo + " €/g",
      prima: vecchio + " €/g",
      dopo: nuovo + " €/g",
    };
  }

  if (t === "negativa") {
    var negativa = op.parametri.testo;
    if (!negativa) throw new Error("Testo della negativa mancante");
    if (typeof mira.campagna.createNegativeKeyword !== "function") {
      throw new Error("Questo tipo di campagna (PMax/Shopping/Video) non accetta negative da script: usare le liste di esclusione a livello account.");
    }
    mira.campagna.createNegativeKeyword(negativa);
    return { dettaglio: "negativa aggiunta: " + negativa, prima: "assente", dopo: negativa };
  }

  if (t === "pausa_keyword") {
    var eraAttivaKw = mira.keyword.isEnabled();
    mira.keyword.pause();
    return { dettaglio: "keyword in pausa", prima: eraAttivaKw ? "attiva" : "già in pausa", dopo: "in pausa" };
  }

  if (t === "attiva_keyword") {
    var eraPausaKw = mira.keyword.isPaused();
    mira.keyword.enable();
    return { dettaglio: "keyword riattivata", prima: eraPausaKw ? "in pausa" : "già attiva", dopo: "attiva" };
  }

  if (t === "pausa_gruppo") {
    var eraAttivoGr = mira.gruppo.isEnabled();
    mira.gruppo.pause();
    return {
      dettaglio: "gruppo \"" + mira.gruppo.getName() + "\" messo in pausa",
      prima: eraAttivoGr ? "attivo" : "già in pausa",
      dopo: "in pausa",
    };
  }

  if (t === "attiva_gruppo") {
    var eraPausaGr = mira.gruppo.isPaused();
    mira.gruppo.enable();
    return {
      dettaglio: "gruppo \"" + mira.gruppo.getName() + "\" riattivato",
      prima: eraPausaGr ? "in pausa" : "già attivo",
      dopo: "attivo",
    };
  }

  if (t === "nuova_keyword") return creaKeyword(op, mira);
  if (t === "nuova_campagna") return creaCampagna(op, conto);

  throw new Error("Tipo di operazione non gestito: " + t);
}

/** Un budget condiviso vale per più campagne: cambiarlo da qui sarebbe un danno. */
function budgetCondiviso(campagna) {
  try {
    var it = AdsApp.search(
      "SELECT campaign_budget.explicitly_shared FROM campaign WHERE campaign.id = " + campagna.getId()
    );
    if (it.hasNext()) {
      var r = it.next();
      return !!(r.campaignBudget && r.campaignBudget.explicitlyShared);
    }
  } catch (e) {
    Logger.log("   (non sono riuscito a controllare se il budget è condiviso: " + e + ")");
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PARTE 8 — CREAZIONE: keyword nuove e campagne nuove
   Le campagne si creano via bulk upload (l'unico modo che gli Script hanno) e
   nascono SEMPRE IN PAUSA: la checklist 4.1 va passata in interfaccia prima di
   accenderle.
   ═══════════════════════════════════════════════════════════════════════════ */

function creaKeyword(op, mira) {
  var testo = op.parametri.testo;
  if (!testo) throw new Error("Testo della keyword mancante");
  var conMatch = formattaMatch(testo, op.parametri.corrispondenza);

  var gruppi = op.parametri.gruppo
    ? mira.campagna.adGroups().withCondition("ad_group.name = '" + apici(op.parametri.gruppo) + "'").get()
    : mira.campagna.adGroups().withCondition("ad_group.status = 'ENABLED'").get();
  if (!gruppi.hasNext()) throw new Error("Nessun gruppo di annunci trovato nella campagna");
  var gruppo = gruppi.next();

  var esito = gruppo.newKeywordBuilder().withText(conMatch).build();
  if (!esito.isSuccessful()) {
    throw new Error("Keyword rifiutata: " + esito.getErrors().join("; "));
  }
  return {
    dettaglio: "keyword aggiunta in \"" + gruppo.getName() + "\": " + conMatch,
    prima: "assente",
    dopo: conMatch,
  };
}

function creaCampagna(op, conto) {
  var par = op.parametri;
  if (!par.nome || !par.budget) throw new Error("Servono nome e budget");

  // Non ricreare una campagna che esiste già (es. un secondo giro dopo un esito
  // non registrato): il bulk upload non se ne accorgerebbe.
  if (trovaCampagna({ bersaglio: par.nome })) {
    throw new Error("Esiste già una campagna chiamata \"" + par.nome + "\" in questo account: non ne creo un'altra.");
  }

  var colonne = [
    "Campaign", "Budget", "Campaign type", "Campaign state",
    "Ad group", "Keyword", "Criterion type",
    "Ad type", "Final URL",
    "Headline 1", "Headline 2", "Headline 3", "Headline 4", "Headline 5",
    "Headline 6", "Headline 7", "Headline 8", "Headline 9", "Headline 10",
    "Description 1", "Description 2", "Description 3", "Description 4",
  ];
  var upload = AdsApp.bulkUploads().newCsvUpload(colonne, { moneyInMicros: false });
  if (typeof upload.forCampaignManagement === "function") upload.forCampaignManagement();

  var gruppoNome = par.gruppo || "Gruppo 1";

  // Riga campagna: nasce in pausa, sempre
  upload.append({
    "Campaign": par.nome,
    "Budget": Number(par.budget),
    "Campaign type": "Search",
    "Campaign state": "paused",
  });

  // Keyword: [{testo, corrispondenza}]
  var kws = par.keywords || [];
  for (var i = 0; i < kws.length; i++) {
    upload.append({
      "Campaign": par.nome,
      "Ad group": gruppoNome,
      "Keyword": kws[i].testo,
      "Criterion type": etichettaMatch(kws[i].corrispondenza),
    });
  }

  // Annuncio RSA: titoli[] e descrizioni[]
  var titoli = par.titoli || [];
  var descrizioni = par.descrizioni || [];
  if (titoli.length >= 3 && descrizioni.length >= 2 && par.finalUrl) {
    var rigaAnnuncio = {
      "Campaign": par.nome,
      "Ad group": gruppoNome,
      "Ad type": "Responsive search ad",
      "Final URL": par.finalUrl,
    };
    for (var t = 0; t < Math.min(titoli.length, 10); t++) rigaAnnuncio["Headline " + (t + 1)] = titoli[t];
    for (var d = 0; d < Math.min(descrizioni.length, 4); d++) rigaAnnuncio["Description " + (d + 1)] = descrizioni[d];
    upload.append(rigaAnnuncio);
  }

  upload.apply();
  return {
    dettaglio:
      "bulk upload inviato all'account " + conto.id + ": campagna \"" + par.nome + "\" creata IN PAUSA con " +
      kws.length + " keyword" + (titoli.length ? " e 1 annuncio RSA" : "") +
      ". Passare la checklist 4.1 in interfaccia prima di attivarla.",
    prima: "assente",
    dopo: "creata in pausa (" + Number(par.budget) + " €/g)",
  };
}

function formattaMatch(testo, corrispondenza) {
  var m = String(corrispondenza || "broad").toLowerCase();
  var pulito = String(testo).replace(/^[\[\"]+|[\]\"]+$/g, "");
  if (m === "exact" || m === "esatta") return "[" + pulito + "]";
  if (m === "phrase" || m === "frase") return '"' + pulito + '"';
  return pulito;
}

function etichettaMatch(corrispondenza) {
  var m = String(corrispondenza || "broad").toLowerCase();
  if (m === "exact" || m === "esatta") return "Exact";
  if (m === "phrase" || m === "frase") return "Phrase";
  return "Broad";
}

/**
 * Riferisce l'esito all'app. Se l'app non lo registra restituisce false: chi
 * chiama si ferma, perché rifare l'operazione al prossimo giro significherebbe
 * una seconda negativa, una seconda keyword, una seconda campagna.
 */
function riferisci(op, riuscita, dettaglio, prima, dopo) {
  if (ANTEPRIMA) return true;
  var esito = chiamata("post", "/api/v1/operazioni/" + op.id + "/esito", {
    riuscita: riuscita,
    dettaglio: dettaglio,
    prima: prima,
    dopo: dopo,
  });
  if (!esito.ok) {
    Logger.log(
      "⚠⚠ L'APP NON HA REGISTRATO L'ESITO (HTTP " + esito.codice + "). L'operazione " + op.id +
      " (" + op.tipo + " su " + op.bersaglio + ") è stata ESEGUITA ma nell'app risulta ancora approvata. " +
      "Mi fermo qui per non rifarla al prossimo giro: segnare l'esito a mano nell'app."
    );
    RIEPILOGO.push("⚠ esito NON registrato per l'operazione " + op.id + " — da sistemare a mano");
    return false;
  }
  return true;
}

/* ═══════════════════════════════ Utilità ═══════════════════════════════════ */

function corpoBase(conto, extra) {
  var corpo = { canale: "google_ads", account: conto.id };
  if (BRAND) corpo.brand = BRAND;
  for (var k in extra) {
    if (Object.prototype.hasOwnProperty.call(extra, k)) corpo[k] = extra[k];
  }
  return corpo;
}

/**
 * Manda le righe a blocchi. Se l'app fatica (timeout, blocco troppo grande) il
 * blocco si dimezza e si riprova, invece di perdere tutto il resto.
 */
function inviaABlocchi(percorso, righe, corpoDa) {
  if (righe.length === 0) return { inviate: 0, nota: "niente da inviare" };
  if (ANTEPRIMA) {
    Logger.log("ANTEPRIMA: non invio le " + righe.length + " righe a " + percorso + ".");
    return { inviate: 0, nota: "anteprima" };
  }

  var blocco = BLOCCO_INIZIALE;
  var i = 0, inviate = 0;
  var conteggi = {};

  while (i < righe.length) {
    if (tempoScaduto()) {
      Logger.log("Tempo quasi finito: mi fermo a " + inviate + "/" + righe.length + " righe. Il prossimo giro le rimanda.");
      return { inviate: inviate, nota: "interrotto per tempo" };
    }
    var lotto = righe.slice(i, i + blocco);
    var esito = chiamata("post", percorso, corpoDa(lotto));

    if (esito.ok) {
      i += lotto.length;
      inviate += lotto.length;
      accumula(conteggi, esito.dati);
      continue;
    }
    var troppoGrande = esito.codice === 0 || esito.codice === 413 || esito.codice === 502 || esito.codice === 504;
    if (troppoGrande && blocco > BLOCCO_MINIMO) {
      blocco = Math.max(BLOCCO_MINIMO, Math.floor(blocco / 2));
      Logger.log("   l'app non ce l'ha fatta (HTTP " + esito.codice + "): riprovo con blocchi da " + blocco + " righe");
      continue;
    }
    Logger.log("⚠ Errore HTTP " + esito.codice + " su " + percorso + ": " + esito.testo);
    return { inviate: inviate, nota: "interrotto su HTTP " + esito.codice };
  }

  var dettaglio = [];
  for (var k in conteggi) {
    if (Object.prototype.hasOwnProperty.call(conteggi, k) && conteggi[k]) dettaglio.push(k + ": " + conteggi[k]);
  }
  if (dettaglio.length) Logger.log("   app → " + dettaglio.join(" · "));
  return { inviate: inviate, nota: dettaglio.join(" · ") };
}

/** Somma i numeri della risposta dell'app (metricheSalvate, campagneCreate, …). */
function accumula(conteggi, dati) {
  if (!dati) return;
  for (var k in dati) {
    if (!Object.prototype.hasOwnProperty.call(dati, k)) continue;
    var v = dati[k];
    if (typeof v === "number") {
      conteggi[k] = (conteggi[k] || 0) + v;
    } else if (v && typeof v === "object") {
      for (var k2 in v) {
        if (!Object.prototype.hasOwnProperty.call(v, k2)) continue;
        if (typeof v[k2] === "number") conteggi[k + "." + k2] = (conteggi[k + "." + k2] || 0) + v[k2];
      }
    }
  }
}

/** Una chiamata all'app, con ritenta su 429 e 5xx. */
function chiamata(metodo, percorso, corpo) {
  var opzioni = { method: metodo, headers: { "x-api-key": CHIAVE_API }, muteHttpExceptions: true };
  if (corpo) {
    opzioni.contentType = "application/json";
    opzioni.payload = JSON.stringify(corpo);
  }
  var attesa = 2000;
  for (var t = 1; t <= TENTATIVI; t++) {
    var codice = 0, testo = "";
    try {
      var risposta = UrlFetchApp.fetch(URL_APP + percorso, opzioni);
      codice = risposta.getResponseCode();
      testo = risposta.getContentText();
    } catch (e) {
      testo = String(e);
    }
    if (codice >= 200 && codice < 300) {
      var dati = null;
      try { dati = JSON.parse(testo); } catch (e2) { dati = null; }
      return { ok: true, codice: codice, testo: testo, dati: dati };
    }
    var ritentabile = codice === 0 || codice === 429 || codice >= 500;
    if (!ritentabile || t === TENTATIVI) {
      return { ok: false, codice: codice, testo: String(testo).slice(0, 300), dati: null };
    }
    Logger.log("   tentativo " + t + " fallito (HTTP " + codice + "): riprovo fra " + attesa / 1000 + "s");
    Utilities.sleep(attesa);
    attesa = attesa * 3;
  }
  return { ok: false, codice: 0, testo: "esauriti i tentativi", dati: null };
}

/** Stesso ragionamento dell'app (src/lib/ingest-metriche.ts) per dedurre il brand. */
function brandDa(nome) {
  var t = String(nome || "").toLowerCase();
  if (/deluxyflower|flowers/.test(t)) return "flowers";
  if (/cake|torte/.test(t)) return "cake";
  if (/deluxy|gifts|regali/.test(t)) return "gifts";
  return "cross";
}

function tempoScaduto() {
  return new Date().getTime() - INIZIO > MINUTI_MASSIMI * 60 * 1000;
}

/** Somma due numeri che possono non esserci: null + null resta null. */
function sommaSeCe(a, b) {
  if (a == null && b == null) return null;
  return arrotonda(Number(a || 0) + Number(b || 0));
}

function arrotonda(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Un numero della configurazione, comunque l'abbiano scritto. "7 giorni" o
 * "30gg" passano con un avviso; quello che non somiglia a un numero prende il
 * valore di riserva invece di far fallire tutto il giro.
 */
function numeroConfig(valore, difetto, nome) {
  var n = Number(valore);
  if (isFinite(n) && n > 0) return n;
  var ripulito = Number(String(valore).split(",").join(".").replace(/[^0-9.]/g, ""));
  if (isFinite(ripulito) && ripulito > 0) {
    Logger.log("⚠ " + nome + " = \"" + valore + "\": va scritto come numero puro. Leggo " + ripulito + ".");
    return ripulito;
  }
  Logger.log("⚠ " + nome + " = \"" + valore + "\" non è un numero: uso " + difetto + ".");
  return difetto;
}

/** Le quote di Google arrivano 0-1 (e a volte come stringa "< 10%"). */
function frazione(v) {
  if (v == null || v === "") return null;
  var n = Number(String(v).split("%").join("").split("<").join("").split(",").join("."));
  if (isNaN(n)) return null;
  if (n > 1) n = n / 100; // per sicurezza, se un giorno arrivasse in percentuale
  return Math.round(n * 10000) / 10000;
}

function dataIso(deltaGiorni) {
  var delta = Number(deltaGiorni);
  if (!isFinite(delta)) {
    // Senza questo controllo la query partiva con 'NaN-NaN-NaN' e Google la
    // rifiutava con un messaggio che non nominava la causa vera.
    throw new Error(
      "Periodo non valido (" + deltaGiorni + "): GIORNI_INDIETRO e GIORNI_COPY " +
      "vanno scritti come numeri puri, senza unità — 7, non \"7 giorni\"."
    );
  }
  var d = new Date();
  d.setDate(d.getDate() + delta);
  var m = String(d.getMonth() + 1);
  var g = String(d.getDate());
  if (m.length < 2) m = "0" + m;
  if (g.length < 2) g = "0" + g;
  return d.getFullYear() + "-" + m + "-" + g;
}

function apici(s) {
  return String(s).split("'").join("\\'");
}

function soloCifre(s) {
  return String(s || "").replace(/\D/g, "");
}

function indiceIn(lista, valore) {
  for (var i = 0; i < lista.length; i++) if (lista[i] === valore) return i;
  return -1;
}

function filtraVuoti(lista) {
  var fuori = [];
  for (var i = 0; i < lista.length; i++) if (lista[i]) fuori.push(lista[i]);
  return fuori;
}

/** "Gruppo A, Gruppo B (+3)": i nomi dei gruppi senza allungare all'infinito. */
function elenco(nomi) {
  if (!nomi || nomi.length === 0) return null;
  if (nomi.length <= 3) return nomi.join(", ");
  return nomi.slice(0, 3).join(", ") + " (+" + (nomi.length - 3) + ")";
}

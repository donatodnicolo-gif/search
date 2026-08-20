/**
 * Genera `src/lib/universo-recenti.ts` dai cambi di amministratore delegato censiti negli
 * ultimi 24 mesi.
 *
 *   node scripts/genera-universo.mjs
 *
 * I dati vengono da una ricerca su fonti pubbliche: ogni ticker è stato provato davvero
 * sull'API dei prezzi prima di entrare qui. I casi senza successore nominato (Ferragamo,
 * The Italian Sea Group) sono esclusi di proposito: un mandato che non è cominciato non si
 * può misurare. Sono esclusi anche i titoli delistati, perché la serie si ferma e ogni
 * confronto diventa falso.
 */

import fs from "node:fs";

/** Casi con ticker verificato. `forzato` e `successoreEsterno`: true/false/null (mai inventati). */
const CASI = [
  // --- Italia -------------------------------------------------------------
  { s: "TRN.MI", n: "Terna", p: "Italia", set: "Utility, reti elettriche", ceo: "Pasqualino Monti", pre: "Giuseppina Di Foggia", ann: "2026-04-09", eff: "2026-05-12", forz: true, est: true, conf: "alta",
    ctx: "Di Foggia non riconfermata nel giro di nomine delle partecipate pubbliche; Monti arriva dalla guida di ENAV.", f: [["Terna — insediamento del nuovo consiglio", "https://www.terna.it/it/media/comunicati-stampa/dettaglio/insediamento-nuovo-consiglio-amministrazione-2026", "2026-05-12"]] },
  { s: "ENAV.MI", n: "ENAV", p: "Italia", set: "Infrastrutture, controllo del traffico aereo", ceo: "Igor De Biasio", pre: "Pasqualino Monti", ann: "2026-04-09", eff: "2026-05-14", forz: false, est: true, conf: "alta",
    ctx: "Effetto domino delle nomine pubbliche: Monti passa a Terna, al suo posto De Biasio, già presidente di Terna.", f: [["ENAV — nomina dell'amministratore delegato", "https://www.enav.it/node/18617", "2026-05-14"]] },
  { s: "CPR.MI", n: "Davide Campari-Milano", p: "Italia / Paesi Bassi", set: "Bevande e distillati", ceo: "Simon Hunt", pre: "Matteo Fantacchiotti", ann: "2024-12-04", eff: "2025-01-15", forz: true, est: true, conf: "alta",
    ctx: "Fantacchiotti si dimette dopo cinque mesi in piena frenata del settore; dopo una reggenza ad interim arriva Hunt dall'esterno.", f: [["Campari — dimissioni dell'amministratore delegato", "https://www.camparigroup.com/sites/default/files/downloads/20240918_CEO%20Resignation.pdf", "2024-09-18"]] },
  { s: "MB.MI", n: "Mediobanca", p: "Italia", set: "Banche e investment banking", ceo: "Alessandro Melzi d'Eril", pre: "Alberto Nagel", ann: "2025-10-28", eff: "2025-10-28", forz: true, est: true, conf: "media",
    ctx: "Nagel si dimette dopo il successo dell'offerta di MPS; il nuovo consiglio nomina Melzi d'Eril, che arriva da Anima.", f: [["Mediobanca, il nuovo amministratore delegato", "https://www.insurancetrade.it/insurance/contenuti/mercato/15768/mediobanca-melzi-d-eril-e-il-nuovo-amministratore-delegato", "2025-10-28"]] },
  { s: "NEXI.MI", n: "Nexi", p: "Italia", set: "Pagamenti digitali", ceo: "Bernardo Mingrone", pre: "Paolo Bertoluzzo", ann: "2026-03-25", eff: "2026-03-25", forz: true, est: false, conf: "alta",
    ctx: "Sostituzione spinta dagli azionisti di riferimento dopo la bocciatura del piano industriale e un titolo a -40% in un anno.", f: [["Nexi, Mingrone nuovo amministratore delegato", "https://www.borsaitaliana.it/borsa/notizie/teleborsa/finanza/nexi-bernardo-mingrone-nuovo-ceo-paolo-bertoluzzo-lascia-dopo-10-anni-11_2026-03-26_TLB.html", "2026-03-26"]] },
  { s: "MONC.MI", n: "Moncler", p: "Italia", set: "Lusso e abbigliamento", ceo: "Bartolomeo Rongone", pre: "Remo Ruffini", ann: "2026-01-20", eff: "2026-04-01", forz: false, est: true, conf: "alta",
    ctx: "Separazione fra proprietà e gestione: Ruffini resta presidente esecutivo, la gestione va a un manager esterno di primo piano.", f: [["Moncler nomina Rongone amministratore delegato", "https://www.borsaitaliana.it/borsa/notizie/teleborsa/finanza/moncler-nomina-bartolomeo-rongone-nuovo-ceo-remo-ruffini-assume-il-ruolo-di-presidente-esecutivo-197_2026-01-20_TLB.html", "2026-01-20"]] },
  { s: "GEO.MI", n: "Geox", p: "Italia", set: "Calzature", ceo: "Francesco Di Giovanni", pre: "Enrico Mistron", ann: "2025-07-23", eff: "2025-07-23", forz: true, est: true, conf: "alta",
    ctx: "Seconda sostituzione del vertice in sedici mesi, per accelerare il rilancio e il taglio dei costi.", f: [["Geox, il nuovo amministratore delegato", "https://www.milanofinanza.it/fashion/geox-francesco-di-giovanni-e-il-nuovo-amministratore-delegato-al-via-la-fase-due-del-rilancio-202507231851419743", "2025-07-23"]] },
  { s: "IRE.MI", n: "Iren", p: "Italia", set: "Multiutility", ceo: "Gianluca Bufo", pre: "Paolo Signorini", ann: "2024-09-10", eff: "2024-09-10", forz: true, est: false, conf: "alta",
    ctx: "Nomina dopo mesi senza amministratore delegato: il predecessore era stato arrestato e revocato per giusta causa.", f: [["Iren nomina Gianluca Bufo", "https://www.gruppoiren.it/it/media/comunicati-stampa/2024/il-consiglio-di-amministrazione-di-Iren-nomina-Gianluca-Bufo-Amministratore-delegato-e-direttore-generale.html", "2024-09-10"]] },
  { s: "SRG.MI", n: "Snam", p: "Italia", set: "Infrastrutture del gas", ceo: "Agostino Scornajenchi", pre: "Stefano Venier", ann: "2025-05-14", eff: "2025-05-14", forz: true, est: true, conf: "media",
    ctx: "Venier dato per la riconferma ma non inserito nella lista dell'azionista pubblico.", f: [["Snam, Scornajenchi nuovo amministratore delegato", "https://www.ansa.it/sito/notizie/economia/2025/05/14/snam-agostino-scornajenchi-nuovo-amministratore-delegato_84ca86dc-392b-494c-9076-31a95483e962.html", "2025-05-14"]] },
  { s: "TEN.MI", n: "Tenaris", p: "Italia / Lussemburgo", set: "Tubi per l'energia", ceo: "Gabriel Podskubka", pre: "Paolo Rocca", ann: "2026-05-06", eff: null, forz: false, est: false, conf: "alta",
    ctx: "Successione pianificata dopo 25 anni: Rocca resta presidente, il vertice operativo passa a un interno.", f: [["Tenaris announces CEO succession", "https://www.tenaris.com/en/news/2026/tenaris-announces-ceo-succession", "2026-05-06"]] },
  { s: "BFF.MI", n: "BFF Bank", p: "Italia", set: "Banca specializzata", ceo: "Giuseppe Sica", pre: "Massimiliano Belingheri", ann: "2026-03-18", eff: "2026-03-18", forz: true, est: false, conf: "alta",
    ctx: "Uscita contestuale alla rettifica dei conti passati, al taglio del target e a un titolo in caduta di circa il 30%.", f: [["BFF Bank, Sica nuovo amministratore delegato", "https://www.bebankers.it/bff-bank-giuseppe-sica-nuovo-amministratore-delegato/", "2026-03-18"]] },
  { s: "PRT.MI", n: "Esprinet", p: "Italia", set: "Distribuzione informatica", ceo: "Giovanni Testa", pre: "Alessandro Cattani", ann: "2026-03-12", eff: "2026-05-01", forz: false, est: false, conf: "alta",
    ctx: "Successione pianificata dopo oltre venticinque anni; il predecessore resta azionista rilevante.", f: [["Esprinet, Testa nuovo amministratore delegato", "https://www.channelcity.it/news/30109/esprinet-giovanni-testa-e-il-nuovo-amministratore-delegato.html", "2026-03-23"]] },
  { s: "ASC.MI", n: "Ascopiave", p: "Italia", set: "Distribuzione del gas", ceo: "Stefano Faè", pre: "Nicola Cecconato", ann: "2026-06-08", eff: "2026-06-08", forz: true, est: false, conf: "media",
    ctx: "Mancato rinnovo del predecessore in assemblea e uscita consensuale; poteri accentrati sull'amministratore delegato.", f: [["Ascopiave, nominato il nuovo amministratore delegato", "https://www.quotidianoenergia.it/module/news/page/entry/id/532889", "2026-06-08"]] },
  { s: "JUVE.MI", n: "Juventus Football Club", p: "Italia", set: "Sport e intrattenimento", ceo: "Damien Comolli", pre: "Maurizio Scanavino", ann: "2025-11-11", eff: "2025-11-11", forz: null, est: false, conf: "alta",
    ctx: "Cessato il mandato del predecessore, il consiglio promuove il direttore generale in carica dall'estate.", f: [["Juventus — Comolli nominato amministratore delegato", "https://www.juventus.com/it/news/articoli/damien-comolli-nominato-amministratore-delegato-11-11-2025", "2025-11-11"]] },
  { s: "ELC.MI", n: "Elica", p: "Italia", set: "Elettrodomestici", ceo: "Luca Barboni", pre: "Giulio Cocci", ann: "2026-03-25", eff: "2026-03-25", forz: true, est: false, conf: "alta",
    ctx: "Ricambio concordato dopo un esercizio chiuso in perdita, con semplificazione della struttura manageriale; il successore è in azienda da oltre vent'anni.", f: [["Elica, Barboni nuovo amministratore delegato", "https://www.borsaitaliana.it/borsa/notizie/teleborsa/finanza/elica-luca-barboni-nuovo-ceo-giulio-cocci-si-dimette-in-accordo-con-la-societa-111_2026-03-25_TLB.html", "2026-03-25"]] },
  { s: "BSS.MI", n: "Biesse", p: "Italia", set: "Macchine utensili", ceo: "Roberto Selci", pre: "Massimo Potenza", ann: "2025-06-12", eff: "2025-06-12", forz: true, est: false, conf: "media",
    ctx: "Ritorno della famiglia fondatrice alla guida operativa dopo il tentativo con un manager esterno; uscita accompagnata da una indennità rilevante.", f: [["Biesse, Selci nuovo amministratore delegato", "https://www.teleborsa.it/News/2025/06/12/biesse-potenza-rinuncia-alla-carica-di-ceo-e-direttore-generale-selci-nuovo-ad-81.html", "2025-06-12"]] },

  // --- Europa -------------------------------------------------------------
  { s: "KER.PA", n: "Kering", p: "Francia", set: "Lusso", ceo: "Luca de Meo", pre: "François-Henri Pinault", ann: "2025-06-16", eff: "2025-09-15", forz: false, est: true, conf: "alta",
    ctx: "Separazione dei ruoli di presidente e amministratore delegato; de Meo arriva da Renault per rilanciare il marchio principale.", f: [["Kering announces the appointment of Luca de Meo", "https://www.globenewswire.com/news-release/2025/06/16/3100070/0/en/Kering-announces-the-appointment-of-Luca-de-Meo-as-Chief-Executive-Officer.html", "2025-06-16"]] },
  { s: "RNO.PA", n: "Renault", p: "Francia", set: "Automotive", ceo: "François Provost", pre: "Luca de Meo", ann: "2025-07-31", eff: "2025-07-31", forz: true, est: false, conf: "media",
    ctx: "Uscita improvvisa del predecessore verso un altro gruppo; scelta interna per non cambiare rotta.", f: [["Provost appointed new CEO of Renault Group", "https://www.electrive.com/2025/07/31/francois-provost-appointed-new-ceo-of-renault-group/", "2025-07-31"]] },
  { s: "ULVR.L", n: "Unilever", p: "Regno Unito", set: "Beni di consumo", ceo: "Fernando Fernandez", pre: "Hein Schumacher", ann: "2025-02-25", eff: "2025-03-01", forz: true, est: false, conf: "alta",
    ctx: "Uscita dopo meno di due anni: il consiglio non era soddisfatto del ritmo della ristrutturazione, con un attivista nel capitale.", f: [["Unilever Board update", "https://www.unilever.com/news/press-and-media/press-releases/2025/unilever-board-update-25-02-25/", "2025-02-25"]] },
  { s: "DGE.L", n: "Diageo", p: "Regno Unito", set: "Bevande e distillati", ceo: "Dave Lewis", pre: "Debra Crew", ann: "2025-11-10", eff: "2026-01-01", forz: true, est: true, conf: "alta",
    ctx: "Uscita per mutuo accordo dopo il crollo del titolo; arriva un esterno con un passato da amministratore delegato nella grande distribuzione.", f: [["Sir Dave Lewis appointed Diageo CEO", "https://www.diageo.com/en/news-and-media/press-releases/2025/sir-dave-lewis-appointed-diageo-plc-ceo", "2025-11-10"]] },
  { s: "PUM.DE", n: "Puma", p: "Germania", set: "Abbigliamento sportivo", ceo: "Arthur Hoeld", pre: "Arne Freundt", ann: "2025-04-03", eff: "2025-07-01", forz: true, est: true, conf: "alta",
    ctx: "Uscita per visioni divergenti sull'esecuzione della strategia dopo trimestri deludenti; il successore arriva dal concorrente principale.", f: [["PUMA appoints Arthur Hoeld as CEO", "https://about.puma.com/en/newsroom/corporate-news/2025/03-04-2025-puma-appoints-arthur-hoeld-ceo-and-matthias-baumer-chief", "2025-04-03"]] },
  { s: "CBK.DE", n: "Commerzbank", p: "Germania", set: "Banche", ceo: "Bettina Orlopp", pre: "Manfred Knof", ann: "2024-09-24", eff: "2024-10-01", forz: null, est: false, conf: "alta",
    ctx: "Uscita anticipata di oltre un anno mentre un concorrente saliva nel capitale; promossa la responsabile finanziaria.", f: [["Commerzbank — Wechsel an der Konzernspitze", "https://www.commerzbank.de/group/newsroom/press-releases/2024/20240924-pm-wechsel-konzernspitze.pdf", "2024-09-24"]] },
  { s: "P911.DE", n: "Porsche AG", p: "Germania", set: "Automotive di lusso", ceo: "Michael Leiters", pre: "Oliver Blume", ann: "2025-10-17", eff: "2026-01-01", forz: null, est: true, conf: "alta",
    ctx: "Fine del doppio incarico del predecessore dopo la costosa marcia indietro sull'elettrico.", f: [["Leiters becomes CEO of Porsche AG", "https://newsroom.porsche.com/en/2025/company/porsche-dr-michael-leiters-becomes-ceo-on-1-january-2026-40864.html", "2025-10-17"]] },
  { s: "NOVO-B.CO", n: "Novo Nordisk", p: "Danimarca", set: "Farmaceutico", ceo: "Maziar Mike Doustdar", pre: "Lars Fruergaard Jørgensen", ann: "2025-07-29", eff: "2025-08-07", forz: true, est: false, conf: "alta",
    ctx: "Uscita dopo il crollo del titolo e la perdita del vantaggio competitivo; annuncio contestuale al taglio della guidance.", f: [["Doustdar appointed CEO of Novo Nordisk", "https://www.novonordisk.com/content/nncorp/global/en/news-and-media/news-and-ir-materials/news-details.html?id=916408", "2025-07-29"]] },
  { s: "ATO.PA", n: "Atos", p: "Francia", set: "Servizi informatici", ceo: "Philippe Salle", pre: "Jean-Pierre Mustier", ann: "2024-10-14", eff: "2025-02-01", forz: null, est: true, conf: "alta",
    ctx: "Settimo amministratore delegato in tre anni; il successore investe di tasca propria nel capitale.", f: [["Atos appoints Philippe Salle", "https://www.atosgroup.com/en/press/atos-appoints-philippe-salle-chairman-of-the-board-of-directors-with-effect-from-october-14-2024-and-chairman-and-chief-executive-officer-from-february-01-2025", "2024-10-14"]] },
  { s: "WLN.PA", n: "Worldline", p: "Francia", set: "Pagamenti", ceo: "Pierre-Antoine Vacheron", pre: "Marc-Henri Desportes", ann: "2025-02-25", eff: "2025-03-01", forz: true, est: true, conf: "alta",
    ctx: "Dopo i profit warning il consiglio giudica insufficiente anche la gestione ad interim e dichiara di volere un profilo esterno.", f: [["Worldline appoints Pierre-Antoine Vacheron", "https://investors.worldline.com/en/home/news-events/financial-press-releases/2025/pr-2025_02_25_01", "2025-02-25"]] },
  { s: "ALO.PA", n: "Alstom", p: "Francia", set: "Ferroviario", ceo: "Martin Sion", pre: "Henri Poupart-Lafarge", ann: "2025-10-08", eff: "2026-04-01", forz: false, est: true, conf: "alta",
    ctx: "Il predecessore annuncia di non voler chiedere un nuovo mandato dopo dieci anni; dopo mesi di ricerca arriva un esterno.", f: [["Alstom appoints Martin Sion", "https://www.alstom.com/press-releases-news/2025/10/alstoms-board-directors-appoints-martin-sion-chief-executive-officer-effective-1-april-2026", "2025-10-08"]] },
  { s: "BP.L", n: "BP", p: "Regno Unito", set: "Petrolio e gas", ceo: "Meg O'Neill", pre: "Murray Auchincloss", ann: "2025-12-18", eff: "2026-04-01", forz: true, est: true, conf: "alta",
    ctx: "Uscita con effetto immediato dopo meno di due anni, sotto pressione degli attivisti; primo vertice esterno in 116 anni.", f: [["bp announces leadership transition", "https://www.bp.com/en/global/corporate/news-and-insights/press-releases/bp-plc-announces-leadership-transition.html", "2025-12-18"]] },
  { s: "BMW.DE", n: "BMW", p: "Germania", set: "Automotive", ceo: "Milan Nedeljković", pre: "Oliver Zipse", ann: "2025-12-09", eff: "2026-05-14", forz: false, est: false, conf: "alta",
    ctx: "Passaggio programmato a fine mandato; promosso il responsabile della produzione, con contratto lungo.", f: [["BMW — Nachfolge an der Vorstandsspitze", "https://www.press.bmwgroup.com/deutschland/article/detail/T0454373DE/", "2025-12-09"]] },
  { s: "MRK.DE", n: "Merck KGaA", p: "Germania", set: "Farmaceutico e scienze della vita", ceo: "Kai Beckmann", pre: "Belén Garijo", ann: "2025-09-25", eff: "2026-05-01", forz: false, est: false, conf: "alta",
    ctx: "Passaggio di consegne programmato a fine mandato, con affiancamento preventivo del successore.", f: [["Beckmann to succeed Garijo as CEO of Merck", "https://www.emdgroup.com/en/news/garijo-beckmann-25-09-25.html", "2025-09-25"]] },
  { s: "VNA.DE", n: "Vonovia", p: "Germania", set: "Immobiliare residenziale", ceo: "Luka Mucic", pre: "Rolf Buch", ann: "2025-05-06", eff: "2026-01-01", forz: null, est: true, conf: "alta",
    ctx: "Uscita dopo dodici anni e tre esercizi consecutivi in perdita; il successore arriva da un altro settore.", f: [["Vonovia — Mucic appointed as new CEO", "https://www.vonovia.com/en/press/press-releases/2025/strong-start-to-the-year-and-optimistic-outlook-for-2025.-supervisory-board-decides-to-appoint-luka-mucic-as-new-ceo-to-succeed-rolf-buch", "2025-05-06"]] },
  { s: "NESN.SW", n: "Nestlé", p: "Svizzera", set: "Alimentare", ceo: "Philipp Navratil", pre: "Laurent Freixe", ann: "2025-09-01", eff: "2025-09-01", forz: true, est: false, conf: "alta",
    ctx: "Predecessore licenziato con effetto immediato per violazione del codice di condotta; successore interno di lungo corso.", f: [["Nestlé Board appoints Philipp Navratil as CEO", "https://www.nestle.com/media/pressreleases/allpressreleases/executive-board-changes-september-2025", "2025-09-01"]] },

  // --- Stati Uniti --------------------------------------------------------
  { s: "INTC", n: "Intel", p: "Stati Uniti", set: "Semiconduttori", ceo: "Lip-Bu Tan", pre: "Pat Gelsinger", ann: "2025-03-12", eff: "2025-03-18", forz: true, est: true, conf: "alta",
    ctx: "Predecessore rimosso con il piano di rilancio in affanno; dopo tre mesi di reggenza arriva un esterno.", f: [["Intel — Form 8-K", "https://www.sec.gov/Archives/edgar/data/50863/000005086325000036/intc-20250310.htm", "2025-03-10"]] },
  { s: "NKE", n: "Nike", p: "Stati Uniti", set: "Abbigliamento sportivo", ceo: "Elliott Hill", pre: "John Donahoe", ann: "2024-09-19", eff: "2024-10-14", forz: true, est: false, conf: "alta",
    ctx: "Uscita presentata come pensionamento ma letta dal mercato come rimozione dopo il calo delle vendite; richiamato un veterano.", f: [["Nike announces return of Elliott Hill", "https://about.nike.com/en/newsroom/releases/nike-inc-announces-return-of-long-time-nike-veteran-elliott-hill-as-president-and-ceo", "2024-09-19"]] },
  { s: "AAPL", n: "Apple", p: "Stati Uniti", set: "Tecnologia", ceo: "John Ternus", pre: "Tim Cook", ann: "2026-04-20", eff: "2026-09-01", forz: false, est: false, conf: "alta",
    ctx: "Successione pianificata: il predecessore passa alla presidenza esecutiva dopo quindici anni.", f: [["Tim Cook to become Executive Chairman", "https://www.apple.com/newsroom/2026/04/tim-cook-to-become-apple-executive-chairman-john-ternus-to-become-apple-ceo/", "2026-04-20"]] },

  // --- Aggiunti il 20/08/2026: ricerca sui cambi annunciati fra febbraio e agosto 2026 ---
  { s: "PYPL", n: "PayPal", p: "Stati Uniti", set: "Pagamenti digitali", ceo: "Enrique Lores", pre: "Alex Chriss", ann: "2026-02-03", eff: "2026-03-01", forz: true, est: true, conf: "alta",
    ctx: "Il consiglio rimuove Chriss dopo meno di due anni e mezzo dichiarando che il ritmo dell'esecuzione non era all'altezza; il titolo cede circa il 20% in una seduta. Lores arriva da fuori, dopo sei anni alla guida di HP, e insieme a lui cambia anche la presidenza del consiglio.", f: [["PayPal Appoints Enrique Lores as Chief Executive Officer", "https://s205.q4cdn.com/875401827/files/doc_news/PayPal-Appoints-Enrique-Lores-as-Chief-Executive-Officer-and-David-W--Dorman-as-Independent-Board-Chair-2026.pdf", "2026-02-03"], ["PayPal — Form 8-K", "https://www.sec.gov/Archives/edgar/data/1633917/000119312526035860/d68718d8k.htm", "2026-02-03"]] },
  { s: "SRPT", n: "Sarepta Therapeutics", p: "Stati Uniti", set: "Biotecnologie, terapie geniche", ceo: "Michael Severino", pre: "Doug Ingram", ann: "2026-07-27", eff: "2026-07-28", forz: null, est: true, conf: "alta",
    ctx: "Uscita presentata come pensionamento dopo un titolo sceso di oltre il 90% dal picco del 2024 per i problemi di sicurezza di Elevidys; nessuna fonte accerta la forzatura, quindi resta non dichiarata. Severino arriva da fuori: ex amministratore delegato di Tessera, prima vicepresidente di AbbVie con la responsabilità della ricerca.", f: [["Sarepta Therapeutics Appoints Michael Severino Chief Executive Officer", "https://www.businesswire.com/news/home/20260727284554/en/Sarepta-Therapeutics-Appoints-Michael-Severino-M.D.-Chief-Executive-Officer", "2026-07-27"], ["Sarepta — Form 8-K", "https://www.sec.gov/Archives/edgar/data/0000873303/000119312526316995/d101719d8k.htm", "2026-07-27"]] },
  { s: "SIGN.SW", n: "SIG Group", p: "Svizzera", set: "Imballaggi alimentari", ceo: "Ann-Kristin Erkens", pre: "Mikko Keto", ann: "2026-08-17", eff: "2026-08-17", forz: true, est: false, conf: "alta",
    ctx: "Keto rimosso dopo cinque mesi e mezzo: il consiglio dichiara che serviva un tipo di guida diverso. È il secondo cambio brusco in dodici mesi e il titolo perde fino al 27% in giornata, il calo più forte dalla quotazione del 2018. Erkens era direttrice finanziaria dal 2023 e aveva già retto l'interim.", f: [["SIG Group names Ann-Kristin Erkens as CEO", "https://in.investing.com/news/stock-market-news/sig-group-names-annkristin-erkens-as-ceo-replaces-mikko-keto-5558905", "2026-08-17"], ["SIG erlebt innerhalb eines Jahres zweiten abrupten CEO-Wechsel", "https://www.nau.ch/news/wirtschaft/sig-erlebt-innerhalb-eines-jahres-zweiten-abrupten-ceo-wechsel-67161661", "2026-08-17"]] },
  { s: "ECEL.L", n: "Eurocell", p: "Regno Unito", set: "Materiali da costruzione", ceo: "Will Truman", pre: "Darren Waters", ann: "2026-02-09", eff: "2026-02-09", forz: true, est: false, conf: "alta",
    ctx: "Waters lascia con effetto immediato dopo tre anni, con l'edilizia britannica debole e il consiglio deciso a impostare un rilancio. Truman era consigliere non esecutivo dal 2023 ed era appena stato designato direttore finanziario: interno al consiglio, esterno alla gestione operativa.", f: [["Eurocell plc — Directorate changes", "https://www.stockopedia.com/share-prices/eurocell-LON:ECEL/news/reg-eurocell-plc-directorate-changes-urn:newsml:reuters.com:20260209:nRSI2839Sa/", "2026-02-09"], ["Eurocell chief executive steps down as board appoints Will Truman", "https://www.thebusinessdesk.com/eastmidlands/news/2107011-eurocell-chief-executive-steps-down-as-board-appoints-will-truman", "2026-02-09"]] },
  { s: "SAB.MC", n: "Banco Sabadell", p: "Spagna", set: "Banche", ceo: "Marc Armengol", pre: "César González-Bueno", ann: "2026-02-05", eff: "2026-05-06", forz: null, est: false, conf: "alta",
    ctx: "González-Bueno lascia «di comune accordo» subito dopo aver respinto l'offerta ostile di BBVA e ceduto TSB: uscita non programmata ma non accertata come imposta. Armengol è un interno con quasi venticinque anni nel gruppo; nomina ratificata in assemblea previa autorizzazione della Banca centrale europea.", f: [["Banco Sabadell appoints Marc Armengol as new CEO", "https://comunicacion.grupbancsabadell.com/en/press-room/banco-sabadell-appoints-marc-armengol-as-new-ceo-cesar-gonzalez-bueno-to-step-down/", "2026-02-05"], ["Marc Armengol appointed CEO following shareholder ratification", "https://comunicacion.grupbancsabadell.com/en/press-room/marc-armengol-appointed-ceo-of-banco-sabadell-following-shareholder-ratification-at-agm/", "2026-05-06"]] },
  { s: "9638.HK", n: "Ferretti", p: "Italia / Hong Kong", set: "Nautica di lusso", ceo: "Stassi Anastassov", pre: "Alberto Galassi", ann: "2026-05-15", eff: "2026-05-15", forz: null, est: true, conf: "alta",
    ctx: "Il consiglio nominato dall'assemblea chiude l'era Galassi e dà i poteri ad Anastassov con effetto immediato, con l'azionista di controllo Weichai alla presidenza. Il nuovo amministratore delegato è del tutto estraneo alla nautica: ex presidente di Duracell e trent'anni in Procter & Gamble.", f: [["Ferretti, nuovo CdA nomina Stassi Anastassov AD", "https://www.borsaitaliana.it/borsa/notizie/teleborsa/finanza/ferretti-nuovo-cda-nomina-stassi-anastassov-ad-e-tan-ning-amministratore-esecutivo-149_2026-05-15_TLB.html", "2026-05-15"], ["Ferretti: Anastassov nuovo ad", "https://www.ilsole24ore.com/radiocor/nRC_15.05.2026_17.02_48210482", "2026-05-15"]] },
  { s: "HEIA.AS", n: "Heineken", p: "Paesi Bassi", set: "Bevande, birra", ceo: "Rafael Oliveira", pre: "Dolf van den Brink", ann: "2026-06-23", eff: "2026-10-01", forz: null, est: true, conf: "alta",
    ctx: "Van den Brink annuncia l'uscita a gennaio e lascia il 31 maggio con i volumi in calo; il gruppo resta senza guida per mesi prima di scegliere Oliveira, amministratore delegato di JDE Peet's. È il primo esterno alla guida di Heineken nella storia del gruppo.", f: [["Heineken names outsider Oliveira as new CEO", "https://www.rte.ie/news/business/2026/0623/1579859-heineken-names-new-ceo/", "2026-06-23"], ["CEO of Heineken N.V. to step down on 31 May 2026", "https://www.theheinekencompany.com/newsroom/ceo-of-heineken-nv-to-step-down-on-31-may-2026/", "2026-01-12"]] },
  { s: "AD.AS", n: "Ahold Delhaize", p: "Paesi Bassi", set: "Distribuzione alimentare", ceo: "Thierry Garnier", pre: "Frans Muller", ann: "2026-05-06", eff: "2027-04-30", forz: false, est: true, conf: "alta",
    ctx: "Pensionamento programmato con quasi un anno di preavviso: Muller guida il gruppo dal 2018 e lascia all'assemblea del 2027. L'elemento di interesse non è l'uscita ma il successore, che arriva da fuori dopo sei anni alla guida di Kingfisher.", f: [["Ahold Delhaize announces Thierry Garnier as nominee for CEO", "https://newsroom.aholddelhaize.com/ahold-delhaize-announces-thierry-garnier-as-nominee-for-chief-executive-officer-and-member-of-the-management-board-frans-muller-to-retire-from-the-company-in-2027/", "2026-05-06"]] },
  { s: "ERIC-B.ST", n: "Ericsson", p: "Svezia", set: "Apparati per telecomunicazioni", ceo: "Per Narvinger", pre: "Börje Ekholm", ann: "2026-06-16", eff: "2026-10-01", forz: false, est: false, conf: "alta",
    ctx: "Successione pianificata dopo quasi dieci anni di Ekholm, che resta consulente del successore fino al 2027. Narvinger è in azienda dal 1997: successore interno puro, nessun elemento di discontinuità.", f: [["Per Narvinger appointed new President and CEO of Ericsson", "https://www.ericsson.com/en/press-releases/2026/6/per-narvinger-appointed-new-president-and-ceo-of-ericsson-as-borje-ekholm-steps-down", "2026-06-16"], ["Ericsson — Form 6-K", "https://www.sec.gov/Archives/edgar/data/717826/000119312526272235/d106249d6k.htm", "2026-06-16"]] },
];

/** Eventi da aggiungere a titoli GIÀ presenti nell'universo di base. */
const EVENTI_SU_TITOLI_ESISTENTI = [
  { s: "LDO.MI", n: "Leonardo", ceo: "Lorenzo Mariani", pre: "Roberto Cingolani", ann: "2026-04-09", eff: "2026-05-08", forz: true, est: false, conf: "media",
    ctx: "Il governo non ripresenta Cingolani nella lista per il rinnovo del consiglio e designa Mariani, già condirettore generale del gruppo.",
    f: [["Il nuovo consiglio di Leonardo nomina Mariani", "https://www.analisidifesa.it/2026/05/il-nuovo-cda-di-leonardo-nomina-lorenzo-mariani-amministratore-delegato-e-direttore-generale/", "2026-05-08"]] },
];

const esc = (t) => String(t).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const id = (s, ceo) => `${s.split(".")[0].toLowerCase()}-${ceo.split(" ").pop().toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}-in`;

const titolo = (c) => `  {
    simbolo: "${c.s}",
    nome: "${esc(c.n)}",
    paese: "${esc(c.p)}",
    settore: "${esc(c.set)}",
    isin: null,
    ruolo: "recente",
    benchmark: "FTSEMIB.MI",
    note: "Cambio di amministratore delegato annunciato il ${c.ann}.",
  },`;

const evento = (c) => `  {
    id: "${id(c.s, c.ceo)}",
    categoria: "management",
    simbolo: "${c.s}",
    dataRumor: null,
    dataAnnuncio: "${c.ann}",
    dataEfficacia: ${c.eff ? `"${c.eff}"` : "null"},
    tier: "${c.forz === true && c.est === true ? "T2" : c.est === true ? "T2" : "T3"}",
    titolo: "${esc(c.ceo)} amministratore delegato di ${esc(c.n)}",
    persona: "${esc(c.ceo)}",
    predecessore: ${c.pre ? `"${esc(c.pre)}"` : "null"},
    descrizione: "${esc(c.ctx)}",
    forzato: ${c.forz === null ? "null" : c.forz},
    successoreEsterno: ${c.est === null ? "null" : c.est},
    contaminato: false,
    confidenza: "${c.conf}",
    fonti: [${c.f.map(([t, u, d]) => `{ titolo: "${esc(t)}", url: "${u}", data: "${d}" }`).join(", ")}],
  },`;

const testo = `/**
 * Deluxy Fondo — cambi di amministratore delegato degli ultimi 24 mesi.
 *
 * FILE GENERATO da scripts/genera-universo.mjs: non modificarlo a mano, si perde al giro
 * successivo. Per cambiare i dati si modifica lo script.
 *
 * Ogni ticker è stato provato davvero sull'API dei prezzi prima di entrare qui. Sono
 * esclusi di proposito:
 *  - i casi in cui il predecessore è uscito ma NESSUN successore è stato nominato
 *    (Ferragamo, The Italian Sea Group): un mandato che non è cominciato non si misura;
 *  - Telefónica (TEF.MC): la fonte prezzi non ha storico (109 sedute anche con range=max),
 *    quindi il mandato non è misurabile e il titolo non entra nell'universo;
 *  - i titoli delistati o incorporati (Anima, illimity, Banca Popolare di Sondrio, Tod's):
 *    la serie dei prezzi si ferma e ogni confronto con l'indice diventa falso;
 *  - i casi dove cambia solo la presidenza o si accorpano deleghe su chi già comandava
 *    (Lottomatica, MFE, Unipol, De' Longhi): non sono cambi di gestione.
 *
 * Alcune nomine qui dentro hanno data di efficacia **futura** (Ahold Delhaize ad aprile 2027,
 * Heineken ed Ericsson al 1° ottobre 2026, Apple al 1° settembre 2026). Entrano nell'universo
 * perché sono casi da sorvegliare, ma il loro mandato non viene misurato: finché il
 * successore non si insedia a comandare è ancora il predecessore, e il rendimento di quel
 * periodo è suo. Il controllo sta in \`calcolaMandato\`.
 *
 * Cercati e NON entrati, con il motivo, perché non vengano ricercati di nuovo:
 *  - The Italian Sea Group (TISG.MI): Costantino dimissionario dal 20/07/2026 e consiglio in
 *    prorogatio, nessun successore nominato. Da riprendere a settembre 2026.
 *  - Indra (IDR.MC) e Kingfisher (KGF.L): uscita avviata, successore non ancora nominato.
 *  - Puig Brands (PUIG.MC): solo 587 sedute, quotata da maggio 2024. Storico insufficiente.
 *  - Ferretti sul listino di Milano (YACHT.MI): 797 sedute contro le 1.075 di Hong Kong; si
 *    usa la linea primaria 9638.HK.
 *  - WH Smith (SMWH.L) ed Eurotech: casi da manuale ma annunciati fuori dalla finestra
 *    cercata (novembre 2025 e giugno 2025).
 *  - Monte dei Paschi, Enel, Eni, Poste, Italgas, Fincantieri, Saipem, Pirelli, Generali:
 *    verificate, nessun cambio — sono conferme.
 *
 * Un caso limite degno di nota è MPS: nel marzo 2026 l'amministratore delegato è stato
 * revocato e licenziato per giusta causa, poi reintegrato dall'assemblea in aprile. Cambio
 * annunciato e mai avvenuto: resta fuori, perché non esiste un mandato nuovo da misurare.
 */

import type { EventoManagement } from "./tipi";
import type { Titolo } from "./universo.ts";

export const TITOLI_RECENTI: Titolo[] = [
${CASI.map(titolo).join("\n")}
];

export const EVENTI_RECENTI: EventoManagement[] = [
${[...CASI, ...EVENTI_SU_TITOLI_ESISTENTI].map(evento).join("\n")}
];
`;

fs.writeFileSync("src/lib/universo-recenti.ts", testo);
console.log(`Generato src/lib/universo-recenti.ts: ${CASI.length} titoli nuovi, ${CASI.length + EVENTI_SU_TITOLI_ESISTENTI.length} eventi.`);

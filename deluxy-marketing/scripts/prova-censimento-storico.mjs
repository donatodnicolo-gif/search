// Prova a secco dello script AD HOC del censimento storico, con AdsApp finto.
//
//   node scripts/prova-censimento-storico.mjs
//
// ⚠️ Non tocca niente: né Google, né l'app, né il database. UrlFetchApp è
// finto e raccoglie quello che lo script AVREBBE mandato, così si può
// controllare il corpo della richiesta invece di scoprirlo dal log dentro
// Google Ads il giorno dopo.
//
// ⚠️ La riga finta cambia MESE e STATO a ogni giro: una prova con una riga
// sola e sempre uguale non entra mai nel ramo che aggrega (primo mese, ultimo
// mese, mesi attivi), che è tutto quello che questo script fa di suo. È la
// stessa lezione di `prova-script-google.mjs`: una prova che non entra nel
// corpo del ciclo non prova niente.
import fs from "node:fs";
import vm from "node:vm";

const sorgente = fs.readFileSync(
  new URL("./google-ads-censimento-storico.js", import.meta.url),
  "utf8"
);

const inviati = [];
const registro = [];

// Due campagne per anno: una viva che spende in tre mesi, una RIMOSSA che ha
// speso in un mese solo — cioè il caso per cui esiste questo script.
function risultatiPerAnno() {
  const righe = [];
  for (const mese of [3, 4, 9]) {
    righe.push({
      campaign: { id: "111", name: "[Prova] Campagna viva", status: "ENABLED", advertisingChannelType: "SEARCH" },
      segments: { month: `2024-${String(mese).padStart(2, "0")}-01` },
      metrics: { costMicros: 10_000_000, impressions: 100, clicks: 10, conversions: 1, conversionsValue: 50 },
    });
  }
  // Un mese a ZERO: non deve contare come mese attivo.
  righe.push({
    campaign: { id: "111", name: "[Prova] Campagna viva", status: "ENABLED", advertisingChannelType: "SEARCH" },
    segments: { month: "2024-12-01" },
    metrics: { costMicros: 0, impressions: 0, clicks: 0, conversions: 0, conversionsValue: 0 },
  });
  righe.push({
    campaign: { id: "222", name: "[Prova] Campagna cancellata", status: "REMOVED", advertisingChannelType: "DISPLAY" },
    segments: { month: "2024-06-01" },
    metrics: { costMicros: 5_000_000, impressions: 20, clicks: 2, conversions: 0, conversionsValue: 0 },
  });
  let i = 0;
  return {
    hasNext: () => i < righe.length,
    next: () => righe[i++],
  };
}

const contesto = {
  Logger: { log: (m) => registro.push(String(m)) },
  AdsApp: {
    currentAccount: () => ({ getCustomerId: () => "846-090-5423", getName: () => "Prova" }),
    search: () => risultatiPerAnno(),
  },
  UrlFetchApp: {
    fetch: (url, opzioni) => {
      inviati.push({ url, corpo: JSON.parse(opzioni.payload) });
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ messaggio: "ok (finto)" }),
      };
    },
  },
  Utilities: { sleep: () => {} },
  JSON,
  Math,
  Date,
  String,
  Number,
  Object,
  Array,
  isNaN,
  encodeURIComponent,
};

vm.createContext(contesto);
new vm.Script(sorgente).runInContext(contesto);

// La chiave finta: senza, lo script si ferma prima di mandare (ed è giusto).
contesto.CHIAVE_API = "prova-finta";
contesto.main();

const errori = [];
const righe = inviati.flatMap((i) => i.corpo.righe ?? []);
const viva = righe.find((r) => r.idEsterno === "111" && r.anno === 2024);
const rimossa = righe.find((r) => r.idEsterno === "222" && r.anno === 2024);

if (inviati.length === 0) errori.push("non ha mandato niente all'app");
if (!inviati.every((i) => String(i.url).endsWith("/api/v1/censimento")))
  errori.push("indirizzo sbagliato: " + inviati[0]?.url);
if (!viva) errori.push("manca la campagna viva del 2024");
if (!rimossa) errori.push("manca la campagna RIMOSSA: è il motivo per cui lo script esiste");
if (rimossa && rimossa.stato !== "REMOVED") errori.push("lo stato REMOVED non arriva all'app");
if (viva && viva.spesa !== 30) errori.push(`spesa aggregata sbagliata: ${viva.spesa} invece di 30`);
if (viva && viva.mesiAttivi !== 3)
  errori.push(`mesi attivi sbagliati: ${viva.mesiAttivi} invece di 3 (il mese a zero non conta)`);
if (viva && (viva.primoMese !== 3 || viva.ultimoMese !== 9))
  errori.push(`finestra sbagliata: ${viva?.primoMese}→${viva?.ultimoMese} invece di 3→9`);
if (viva && viva.conversioni !== 3) errori.push(`conversioni sbagliate: ${viva.conversioni}`);
// Un anno per riga, non un minestrone: quattro anni civili × due campagne.
const anni = [...new Set(righe.map((r) => r.anno))];
if (anni.length < 2) errori.push(`gli anni non si separano: ${anni.join(", ")}`);

console.log(`${righe.length} righe in ${inviati.length} invii · anni ${anni.sort().join(", ")}`);
if (viva) console.log("viva:", JSON.stringify(viva));
if (rimossa) console.log("rimossa:", JSON.stringify(rimossa));

if (errori.length) {
  console.error("\n⚠ PROVA FALLITA:");
  for (const e of errori) console.error(" · " + e);
  process.exit(1);
}
console.log("\n✓ Prova superata: aggregazione per campagna×anno, mesi attivi, rimosse incluse.");

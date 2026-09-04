// Ritira (annulla) una richiesta di pagamento che Finance ha mandato a Deluxy
// Transactions, con la chiave e il segreto HMAC di Finance (stessa firma di
// src/lib/transactions.ts). Funziona solo finché la richiesta è `in_attesa` o
// `sospesa`: dopo l'approvazione la decisione non è più di chi ha chiesto.
//
//   node --env-file=.env scripts/ritira-richiesta-transactions.mjs TRX-2026-000049 "motivo"          (prova a secco: legge e basta)
//   node --env-file=.env scripts/ritira-richiesta-transactions.mjs TRX-2026-000049 "motivo" --esegui
//
// Nato il 04/09/2026 per TRX-2026-000049 (ANTOFLOWERS, 185,22 € = lordo di
// agosto al posto del netto in compensazione di 48,30 €). Il webhook di
// Transactions rimette il mese «rifacibile» in Finance.
import { createHash, createHmac, randomUUID } from "crypto";

const INVISIBILI = new RegExp("[​-‍﻿ ]", "g");
const pulisci = (v) => (v ?? "").replace(INVISIBILI, "").trim().replace(/^["']|["']$/g, "").trim();

const [riferimento, motivo = "Ritirata da Finance.", flag] = process.argv.slice(2);
if (!riferimento) {
  console.error("Uso: ritira-richiesta-transactions.mjs <TRX-…> [motivo] [--esegui]");
  process.exit(2);
}
const esegui = flag === "--esegui";
const apiKey = pulisci(process.env.TRANSACTIONS_API_KEY);
const segreto = pulisci(process.env.TRANSACTIONS_HMAC_SECRET);
const base = (pulisci(process.env.TRANSACTIONS_URL) || "https://deluxy-transactions.vercel.app").replace(/\/$/, "");
if (!apiKey || !segreto) {
  console.error("Mancano TRANSACTIONS_API_KEY / TRANSACTIONS_HMAC_SECRET nell'ambiente.");
  process.exit(2);
}

async function chiamata(metodo, percorso, corpoObj) {
  const corpo = corpoObj ? JSON.stringify(corpoObj) : "";
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const impronta = createHash("sha256").update(corpo).digest("hex");
  const firma = createHmac("sha256", segreto).update([metodo, percorso, timestamp, nonce, impronta].join("\n")).digest("hex");
  const res = await fetch(base + percorso, {
    method: metodo,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "x-deluxy-timestamp": timestamp,
      "x-deluxy-nonce": nonce,
      "x-deluxy-signature": `sha256=${firma}`,
    },
    ...(corpo ? { body: corpo } : {}),
    signal: AbortSignal.timeout(15000),
  });
  return { stato: res.status, dati: await res.json().catch(() => null) };
}

const percorso = `/api/v1/richieste/${encodeURIComponent(riferimento)}`;
const prima = await chiamata("GET", percorso);
if (prima.stato !== 200 || !prima.dati) {
  console.error(`Transactions ha risposto ${prima.stato}:`, prima.dati);
  process.exit(1);
}
console.log(`${riferimento}: stato ${prima.dati.stato}, ${(Number(prima.dati.importoCent) / 100).toFixed(2)} €, ${prima.dati.beneficiario}`);
if (prima.dati.stato !== "in_attesa" && prima.dati.stato !== "sospesa") {
  console.log("Non è più ritirabile da qui (serve un operatore dentro Transactions).");
  process.exit(1);
}
if (!esegui) {
  console.log("Prova a secco: aggiungi --esegui per ritirarla davvero.");
  process.exit(0);
}
const esito = await chiamata("POST", `${percorso}/annulla`, { motivo });
console.log(`annulla → ${esito.stato}`, esito.dati);
const dopo = await chiamata("GET", percorso);
console.log(`${riferimento}: ora ${dopo.dati?.stato}`);
process.exit(esito.stato === 200 || esito.stato === 201 ? 0 : 1);

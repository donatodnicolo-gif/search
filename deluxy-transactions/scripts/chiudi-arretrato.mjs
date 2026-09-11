// Chiude in blocco un arretrato della coda di Transactions passando dalle API
// FIRMATE, con la chiave dell'app CHE HA CHIESTO il pagamento: la stessa strada
// che avrebbe fatto l'app da sola, quindi stesso registro, stesso sigillo,
// stesso webhook di ritorno, e nell'evento resta scritto `dichiaratoDa: <app>`.
//
// ⚠️ NON scrive mai sul database direttamente: una UPDATE a mano romperebbe la
// catena di hash del registro e farebbe scattare l'allarme del sigillo. Se un
// domani serve un'altra riparazione in blocco, si passa ancora da qui.
//
// SI LANCIA DALLA CARTELLA DELL'APP DI ORIGINE, che è dove stanno la sua chiave
// e il suo segreto — così le credenziali le legge node, non una persona:
//
//   cd ../deluxy-messaging
//   node --env-file=.env ../deluxy-transactions/scripts/chiudi-arretrato.mjs <piano.json>
//   node --env-file=.env ../deluxy-transactions/scripts/chiudi-arretrato.mjs <piano.json> --esegui
//
// Senza `--esegui` è una prova a secco: legge lo stato di ogni riga e dice cosa
// farebbe. Le righe già chiuse le salta, quindi si può rilanciare senza danno.
//
// Il piano è un array di:
//   { trx, chiave, azione: "pagata-fuori" | "annulla", corpo: {...} }
// dove `chiave` è il riferimento di Transactions (TRX-…) oppure il proprio
// `riferimentoEsterno`, e `corpo` è quello che vuole la rotta:
//   pagata-fuori → { metodo, dataPagamento, motivo }   annulla → { motivo }
//
// Nato l'11/09/2026 per l'arretrato del Customer Service: 41 richieste pagate
// nel CS ma rimaste in coda qui (il collegamento CS→Transactions è del 05/09,
// e quelle erano state pagate prima), più le richieste di Finance costruite col
// criterio del netto d'anno che l'utente ha rovesciato l'11/09.
import { createHash, createHmac, randomUUID } from "crypto";
import { readFileSync } from "fs";

const INVISIBILI = new RegExp("[​-‍﻿ ]", "g");
const pulisci = (v) => (v ?? "").replace(INVISIBILI, "").trim().replace(/^["']|["']$/g, "").trim();

const percorsoPiano = process.argv[2];
if (!percorsoPiano) {
  console.error("Uso: node --env-file=.env chiudi-arretrato.mjs <piano.json> [--esegui]");
  process.exit(2);
}
const piano = JSON.parse(readFileSync(percorsoPiano, "utf8"));
const esegui = process.argv.includes("--esegui");
const apiKey = pulisci(process.env.TRANSACTIONS_API_KEY);
const segreto = pulisci(process.env.TRANSACTIONS_HMAC_SECRET);
const base = (pulisci(process.env.TRANSACTIONS_URL) || "https://deluxy-transactions.vercel.app").replace(/\/$/, "");
if (!apiKey || !segreto) {
  console.error("Mancano TRANSACTIONS_API_KEY / TRANSACTIONS_HMAC_SECRET: lancialo dalla cartella dell'app di origine con --env-file=.env");
  process.exit(2);
}
console.log(`${piano.length} righe in piano · chiave ${apiKey.slice(0, 10)}… · verso ${base}`);
if (!esegui) console.log("PROVA A SECCO — non cambia niente.\n");

async function chiamata(metodo, percorso, corpoObj) {
  const corpo = corpoObj ? JSON.stringify(corpoObj) : "";
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const impronta = createHash("sha256").update(corpo).digest("hex");
  const firma = createHmac("sha256", segreto)
    .update([metodo, percorso, timestamp, nonce, impronta].join("\n"))
    .digest("hex");
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
    signal: AbortSignal.timeout(20000),
  });
  return { stato: res.status, dati: await res.json().catch(() => null) };
}

let fatte = 0;
let saltate = 0;
let fallite = 0;
for (const p of piano) {
  const percorso = `/api/v1/richieste/${encodeURIComponent(p.chiave)}`;
  // Si rilegge SEMPRE lo stato prima di agire: fra la costruzione del piano e
  // adesso qualcuno può aver chiuso la riga a mano, e il piano non lo sa.
  const letto = await chiamata("GET", percorso);
  if (letto.stato !== 200) {
    console.log(`X  ${p.trx} — GET ha risposto ${letto.stato}`);
    fallite++;
    continue;
  }
  const stato = letto.dati?.stato;
  const imp = letto.dati?.importoCent != null ? (letto.dati.importoCent / 100).toFixed(2) : "?";
  if (stato !== "in_attesa" && stato !== "sospesa") {
    console.log(`.  ${p.trx} — già "${stato}", salto`);
    saltate++;
    continue;
  }
  if (!esegui) {
    console.log(`   ${p.trx} ${String(imp).padStart(8)} EUR  ${stato} → ${p.azione}`);
    fatte++;
    continue;
  }
  const e = await chiamata("POST", `${percorso}/${p.azione}`, p.corpo);
  if (e.stato === 200 || e.stato === 201) {
    console.log(`OK ${p.trx} ${String(imp).padStart(8)} EUR → ${p.azione}`);
    fatte++;
  } else {
    console.log(`X  ${p.trx} ${p.azione} → ${e.stato} ${JSON.stringify(e.dati)}`);
    fallite++;
  }
}
console.log(
  esegui
    ? `\nFATTE ${fatte} · saltate ${saltate} · FALLITE ${fallite}`
    : `\nDa eseguire: ${fatte} · già chiuse: ${saltate} · in errore: ${fallite}. Aggiungi --esegui per farlo davvero.`
);
process.exit(fallite ? 1 : 0);

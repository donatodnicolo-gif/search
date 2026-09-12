// Chiude in blocco un arretrato della coda di Transactions passando dalle API
// FIRMATE, con la chiave dell'app CHE HA CHIESTO il pagamento: la stessa strada
// che avrebbe fatto l'app da sola, quindi stesso registro, stesso sigillo,
// stesso webhook di ritorno, e nell'evento resta scritto `dichiaratoDa: <app>`.
//
// ⚠️ NON scrive mai sul database direttamente: una UPDATE a mano romperebbe la
// catena di hash del registro e farebbe scattare l'allarme del sigillo. Se un
// domani serve un'altra riparazione in blocco, si passa ancora da qui.
//
// LE CREDENZIALI LE LEGGE NODE, NON UNA PERSONA. Due modi, a seconda di dove
// stanno la chiave e il segreto dell'app di origine.
//
// 1) Dalla cartella dell'app, se il suo `.env` le ha (è il caso di Finance):
//
//   cd ../deluxy-partner
//   node --env-file=.env ../deluxy-transactions/scripts/chiudi-arretrato.mjs <piano.json>
//
// 2) Da qui, leggendole da `.env.altre-app` (vedi docs/CHIAVI-ALTRE-APP.md).
//    Serve quando l'app non le ha in locale — il Customer Service, per esempio,
//    le tiene solo sul suo Vercel:
//
//   node --env-file=.env.altre-app scripts/chiudi-arretrato.mjs --app cs <piano.json>
//
// In entrambi i casi si aggiunge `--esegui` in coda per farlo davvero.
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

const argomenti = process.argv.slice(2);
const esegui = argomenti.includes("--esegui");
// `--app cs` sceglie la coppia CS_TRANSACTIONS_* dentro `.env.altre-app`.
// Senza, si usano i nomi semplici: sono quelli che l'app ha nel proprio `.env`.
const indiceApp = argomenti.indexOf("--app");
const app = indiceApp >= 0 ? (argomenti[indiceApp + 1] ?? "") : "";
if (indiceApp >= 0 && !app) {
  console.error("`--app` vuole il nome dell'app: --app cs");
  process.exit(2);
}
const percorsoPiano = argomenti.find((a, i) => !a.startsWith("--") && i !== indiceApp + 1);
if (!percorsoPiano) {
  console.error("Uso: node --env-file=<file> chiudi-arretrato.mjs [--app <nome>] <piano.json> [--esegui]");
  process.exit(2);
}
const piano = JSON.parse(readFileSync(percorsoPiano, "utf8"));
const prefisso = app ? `${app.toUpperCase()}_` : "";
const apiKey = pulisci(process.env[`${prefisso}TRANSACTIONS_API_KEY`]);
const segreto = pulisci(process.env[`${prefisso}TRANSACTIONS_HMAC_SECRET`]);
const base = (pulisci(process.env.TRANSACTIONS_URL) || "https://deluxy-transactions.vercel.app").replace(/\/$/, "");
if (!apiKey || !segreto) {
  console.error(
    `Mancano ${prefisso}TRANSACTIONS_API_KEY / ${prefisso}TRANSACTIONS_HMAC_SECRET.\n` +
      (app
        ? `Compila la sezione «${app}» in .env.altre-app e rilancia con --env-file=.env.altre-app.\n` +
          "Per vedere cosa c'è e cosa manca: node --env-file=.env.altre-app scripts/chiavi-presenti.mjs"
        : "Lancialo dalla cartella dell'app di origine con --env-file=.env, oppure da qui con --app <nome> e --env-file=.env.altre-app.")
  );
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

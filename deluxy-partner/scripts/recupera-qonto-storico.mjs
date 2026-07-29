// Recupera da Qonto i movimenti di un intervallo di date e li aggiunge
// all'archivio, deduplicati per hash.
//
// PERCHÉ ESISTE: la sincronizzazione normale scarica dal più recente e si ferma
// a 30 pagine (3.000 movimenti). Basta per il quotidiano, ma il vecchio non
// entra mai — e infatti l'archivio partiva dal 16/07/2025 mentre Qonto ha i
// movimenti dal 13/05/2024. Senza il primo semestre 2025 ogni confronto fra
// anni è sbagliato: i ricavi coprono dodici mesi e i costi sei.
//
// Qui si passa un intervallo, così si scarica solo quello che manca invece di
// tutta la storia.
//
//   node --env-file=.env scripts/recupera-qonto-storico.mjs 2025-01-01 2025-07-31          (prova)
//   node --env-file=.env scripts/recupera-qonto-storico.mjs 2025-01-01 2025-07-31 scrivi   (scrive)
//
// Senza «scrivi» non tocca niente: dice solo cosa troverebbe. Le credenziali
// Qonto si leggono dalla tabella Impostazione (chiavi qonto.login e
// qonto.secretKey), come fa l'app: non vanno passate a mano.

import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();
const [dal, al, modo] = process.argv.slice(2);
const scrivi = modo === "scrivi";
if (!dal || !al) {
  console.error("Uso: node --env-file=.env scripts/recupera-qonto-storico.mjs AAAA-MM-GG AAAA-MM-GG [scrivi]");
  process.exit(1);
}

const BASE = "https://thirdparty.qonto.com/v2";

// Lo stesso hash dell'app (src/lib/estratto.ts): se cambiasse, gli stessi
// movimenti entrerebbero due volte.
const hashMovimento = (data, importo, descrizione) =>
  createHash("sha256")
    .update(`${data.toISOString().slice(0, 10)}|${importo.toFixed(2)}|${descrizione.trim().toUpperCase()}`)
    .digest("hex")
    .slice(0, 32);

const imp = await prisma.impostazione.findMany({ where: { chiave: { in: ["qonto.login", "qonto.secretKey"] } } });
const cfg = Object.fromEntries(imp.map((r) => [r.chiave, r.valore]));
if (!cfg["qonto.login"] || !cfg["qonto.secretKey"]) {
  console.error("Qonto non configurato: mancano qonto.login / qonto.secretKey nelle impostazioni.");
  process.exit(1);
}
const AUTH = { Authorization: `${cfg["qonto.login"]}:${cfg["qonto.secretKey"]}` };

async function qonto(path) {
  const res = await fetch(`${BASE}${path}`, { headers: AUTH });
  if (!res.ok) throw new Error(`Qonto ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const org = await qonto("/organization");
const conti = org.organization.bank_accounts.filter((c) => !c.status || c.status === "active");
console.log(`organizzazione: ${org.organization.legal_name ?? org.organization.slug} · ${conti.length} conti attivi`);
console.log(`intervallo: ${dal} → ${al}\n`);

let totali = 0;
let nuoviTotali = 0;
for (const conto of conti) {
  const txs = [];
  for (let pagina = 1; pagina <= 100; pagina++) {
    const qs = new URLSearchParams({
      iban: conto.iban,
      "status[]": "completed",
      per_page: "100",
      current_page: String(pagina),
      sort_by: "settled_at:asc",
      settled_at_from: `${dal}T00:00:00.000Z`,
      settled_at_to: `${al}T23:59:59.000Z`,
    });
    const r = await qonto(`/transactions?${qs}`);
    txs.push(...(r.transactions ?? []));
    if (!r.meta?.next_page) break;
  }
  totali += txs.length;
  const uscite = txs.filter((t) => t.side === "debit");
  const somma = uscite.reduce((s, t) => s + Math.abs(t.amount), 0);
  console.log(`conto …${conto.iban.slice(-8)}: ${txs.length} movimenti (${uscite.length} uscite per ${Math.round(somma).toLocaleString("it-IT")} €)`);
  if (!txs.length) continue;

  const righe = txs.map((t) => {
    const data = new Date(t.settled_at ?? t.emitted_at);
    const importo = t.side === "credit" ? Math.abs(t.amount) : -Math.abs(t.amount);
    const descrizione = [t.label, t.reference].filter(Boolean).join(" — ") || "(senza descrizione)";
    return {
      data,
      importo,
      divisa: t.currency ?? "EUR",
      descrizione: descrizione.slice(0, 500),
      controparte: t.label?.slice(0, 200) ?? null,
      hash: hashMovimento(data, importo, `qonto:${t.transaction_id}`),
      fonte: `Qonto (${conto.iban.slice(-8)})`,
    };
  });
  const gia = await prisma.transazioneBancaria.count({ where: { hash: { in: righe.map((r) => r.hash) } } });
  console.log(`   già in archivio: ${gia} · da aggiungere: ${righe.length - gia}`);
  if (scrivi) {
    const res = await prisma.transazioneBancaria.createMany({ data: righe, skipDuplicates: true });
    console.log(`   inseriti: ${res.count}`);
    nuoviTotali += res.count;
  } else {
    nuoviTotali += righe.length - gia;
  }
}

console.log(`\n${scrivi ? "INSERITI" : "DA INSERIRE (prova)"}: ${nuoviTotali} movimenti su ${totali} letti`);
if (!scrivi) console.log("Per scrivere davvero, rilancia aggiungendo «scrivi» come terzo argomento.");
await prisma.$disconnect();

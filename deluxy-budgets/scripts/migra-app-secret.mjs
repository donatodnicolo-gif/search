/**
 * MIGRAZIONE DELLE CHIAVI CIFRATE A `APP_SECRET`.
 *
 * ⚠️ Perché serve uno script e non basta aggiungere la variabile su Vercel.
 * `src/lib/crypto.ts` sceglie il segreto **in ordine**:
 * `["APP_SECRET", "HUB_KEYS_TOKEN", "BUDGETS_APP_PASSWORD"]`, e prende il primo
 * che c'è. Oggi in produzione le prime due non ci sono, quindi tutto ciò che è
 * cifrato a database (la riga `OPENAI_API_KEY`) è protetto dalla **password di
 * team**. Nel momento in cui si aggiunge `APP_SECRET`, il primo posto cambia:
 * le righe già scritte diventano illeggibili e l'app le tratta come «non
 * impostate» — cioè l'AI smette di funzionare, in silenzio, senza un errore.
 *
 * ⭐ Un cambio di chiave non è una modifica di configurazione: è una
 * **migrazione di dati**. Si decifra col vecchio segreto e si ricifra col nuovo,
 * nella stessa passata, prima che il nuovo entri in vigore.
 *
 * Uso:
 *   node scripts/migra-app-secret.mjs                 → prova, non scrive
 *   node scripts/migra-app-secret.mjs --scrivi        → scrive
 * Il nuovo segreto si passa in `APP_SECRET_NUOVO`.
 */
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// .env letto a mano: questo script gira fuori da Next.
for (const riga of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const scrive = process.argv.includes("--scrivi");
// `--a=NOME` prende il segreto NUOVO da una variabile d'ambiente già presente,
// invece che dalla riga di comando: un segreto scritto in un comando finisce
// nella cronologia della shell e nella trascrizione della sessione.
const aNome = (process.argv.find((a) => a.startsWith("--a=")) || "").slice(4);
const nuovo = (aNome ? process.env[aNome] || "" : process.env.APP_SECRET_NUOVO || "").trim();
if (!nuovo || nuovo.length < 32) {
  console.error("Manca APP_SECRET_NUOVO (almeno 32 caratteri).");
  process.exit(1);
}

// Il segreto **in uso oggi**, con la stessa regola di src/lib/crypto.ts.
// `--da=NOME` forza da quale segreto si migra.
//
// ⚠️ Serve perché il segreto in uso **non si deduce dalla lista**: in locale
// `APP_SECRET` c'era già, quindi la lista diceva «è lei», ma la riga a database
// era stata scritta dalla produzione — dove `APP_SECRET` non c'è — ed era
// cifrata con la password di team. Cioè: in locale l'app non riusciva a leggere
// la propria chiave OpenAI, e nessuno se n'era accorto perché una chiave che
// non si decifra viene trattata come «non impostata».
//
// ⭐ Qual è il segreto giusto non lo dice la configurazione: lo dice il **dato**.
// Si prova a decifrare, e quello che apre è quello vero.
const forzato = (process.argv.find((a) => a.startsWith("--da=")) || "").slice(5);
const ORDINE = ["APP_SECRET", "HUB_KEYS_TOKEN", "BUDGETS_APP_PASSWORD"];
const vecchioNome = forzato || ORDINE.find((n) => (process.env[n] || "").trim().length >= 8);
if (!vecchioNome) {
  console.error("Nessun segreto in uso: non c'è niente da migrare.");
  process.exit(1);
}
const vecchio = (process.env[vecchioNome] || "").trim();
if (!forzato && vecchioNome === "APP_SECRET") {
  console.error("APP_SECRET è già in uso qui: togliela dall'ambiente locale per migrare dal segreto vecchio.");
  process.exit(1);
}

const chiaveDa = (s) => crypto.scryptSync(s, "deluxy-budgets", 32);

function decifra(cifrato, segreto) {
  const [iv, tag, dati] = cifrato.split(".");
  const d = crypto.createDecipheriv("aes-256-gcm", chiaveDa(segreto), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(dati, "base64")), d.final()]).toString("utf8");
}

function cifra(testo, segreto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", chiaveDa(segreto), iv);
  const dati = Buffer.concat([c.update(testo, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), dati].map((b) => b.toString("base64")).join(".");
}

const prisma = new PrismaClient();
const righe = await prisma.chiaveApi.findMany();
console.log(`Segreto in uso oggi: ${vecchioNome}`);
console.log(`Righe cifrate: ${righe.length}`);

let ok = 0;
const daScrivere = [];
for (const r of righe) {
  let chiaro;
  try {
    chiaro = decifra(r.cifrato, vecchio);
  } catch {
    console.log(`  ✗ ${r.nome}: NON si decifra col segreto in uso — non la tocco.`);
    continue;
  }
  // ⚠️ Il valore in chiaro non si stampa mai: finirebbe nella trascrizione.
  // Si stampa la **forma**, che basta a dire «è ancora quella giusta».
  console.log(`  ✓ ${r.nome}: decifrata (${chiaro.length} caratteri, inizia per ${chiaro.slice(0, 3)}…)`);
  daScrivere.push({ nome: r.nome, cifrato: cifra(chiaro, nuovo) });
  ok++;
}

// Controprova prima di scrivere: quello che ho ricifrato si rilegge col segreto
// nuovo? Se no, la migrazione perde il dato invece di spostarlo.
for (const d of daScrivere) {
  try {
    decifra(d.cifrato, nuovo);
  } catch {
    console.error(`  ✗✗ ${d.nome}: ricifrata ma NON rileggibile col segreto nuovo. Fermo tutto.`);
    process.exit(2);
  }
}
console.log(`Controprova: tutte e ${daScrivere.length} si rileggono col segreto nuovo.`);

if (!scrive) {
  console.log("\nPROVA: non ho scritto niente. Rilancia con --scrivi.");
} else {
  for (const d of daScrivere) {
    await prisma.chiaveApi.update({ where: { nome: d.nome }, data: { cifrato: d.cifrato } });
  }
  console.log(`\nSCRITTE ${daScrivere.length} righe con il segreto nuovo.`);
  console.log("Adesso APP_SECRET va messa su Vercel e va fatto un deploy, o l'app legge col segreto vecchio.");
}
await prisma.$disconnect();

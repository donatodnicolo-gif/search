// Genera il .env di quest'app copiando le stringhe di connessione dal .env di
// un'altra app Deluxy (stesso cluster Postgres) e imponendo `schema=crm`.
// Uso:  npm run db:condiviso -- ../deluxy-calendario/.env
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const sorgente = process.argv[2];
if (!sorgente) {
  console.error("Uso: npm run db:condiviso -- <percorso-.env-di-un-altra-app>");
  process.exit(1);
}
if (!existsSync(sorgente)) {
  console.error(`File non trovato: ${sorgente}`);
  process.exit(1);
}

function conSchema(url) {
  if (!url) return null;
  if (/[?&]schema=/.test(url)) return url.replace(/([?&]schema=)[^&]*/, "$1crm");
  return url + (url.includes("?") ? "&" : "?") + "schema=crm";
}

const righe = readFileSync(sorgente, "utf8").split(/\r?\n/);
const valori = {};
for (const riga of righe) {
  const m = /^(DATABASE_URL|DIRECT_URL)\s*=\s*"?([^"]*)"?\s*$/.exec(riga);
  if (m) valori[m[1]] = conSchema(m[2]);
}

if (!valori.DATABASE_URL || !valori.DIRECT_URL) {
  console.error("Nel file sorgente mancano DATABASE_URL o DIRECT_URL.");
  process.exit(1);
}

const contenuto =
  `DATABASE_URL="${valori.DATABASE_URL}"\n` + `DIRECT_URL="${valori.DIRECT_URL}"\n`;
writeFileSync(new URL("../.env", import.meta.url), contenuto);
console.log("Scritto .env con schema=crm (stringhe di connessione non mostrate).");

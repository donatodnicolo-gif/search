// Configura il .env di questa app copiando DATABASE_URL e DIRECT_URL dal file
// env di un'altra app Deluxy (stesso cluster Postgres) e impostando lo schema
// dedicato "tasks". Non stampa mai le stringhe di connessione.
//
// Uso: npm run db:condiviso -- <percorso-env-sorgente>
// Es.: npm run db:condiviso -- ../deluxy-hub/.env.vercel-prod
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const sorgente = process.argv.slice(2).find((a) => a !== "--");
if (!sorgente) {
  console.error("Uso: npm run db:condiviso -- <percorso-env-sorgente>");
  process.exit(1);
}

const righe = readFileSync(resolve(sorgente), "utf8").split(/\r?\n/);

function prendi(nome) {
  const riga = righe.find((r) => r.startsWith(nome + "="));
  if (!riga) return null;
  let v = riga.slice(nome.length + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v;
}

function conSchema(url) {
  if (!url) return null;
  if (/[?&]schema=/.test(url)) return url.replace(/([?&]schema=)[^&]*/, "$1tasks");
  return url + (url.includes("?") ? "&" : "?") + "schema=tasks";
}

const db = conSchema(prendi("DATABASE_URL"));
const direct = conSchema(prendi("DIRECT_URL"));
if (!db || !direct) {
  console.error("DATABASE_URL o DIRECT_URL mancanti nel file sorgente");
  process.exit(1);
}

const contenuto = [
  '# Postgres condiviso delle app Deluxy (stesso cluster di hub/anagrafiche), schema "tasks"',
  `DATABASE_URL="${db}"`,
  `DIRECT_URL="${direct}"`,
  "",
].join("\n");

writeFileSync(new URL("../.env", import.meta.url), contenuto);
console.log("Scritto .env con schema=tasks (stringhe di connessione non mostrate).");
console.log("Ora lancia: npm run db:push");

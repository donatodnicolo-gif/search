// Configura il .env di questa app copiando DATABASE_URL e DIRECT_URL dal file
// env di un'altra app Deluxy (stesso cluster Postgres) e impostando lo schema
// dedicato "personale". Non stampa mai le stringhe di connessione.
//
// Uso: npm run db:condiviso -- <percorso-env-sorgente>
// Es.: npm run db:condiviso -- ../deluxy-calendario/.env
import { existsSync, readFileSync, writeFileSync } from "fs";
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
  if (/[?&]schema=/.test(url)) return url.replace(/([?&]schema=)[^&]*/, "$1personale");
  return url + (url.includes("?") ? "&" : "?") + "schema=personale";
}

const db = conSchema(prendi("DATABASE_URL"));
const direct = conSchema(prendi("DIRECT_URL"));
if (!db || !direct) {
  console.error("DATABASE_URL o DIRECT_URL mancanti nel file sorgente");
  process.exit(1);
}

// Le righe di connessione si riscrivono; i segreti propri dell'app (password,
// session secret…) già presenti nel .env si conservano.
const destinazione = new URL("../.env", import.meta.url);
const esistenti = existsSync(destinazione)
  ? readFileSync(destinazione, "utf8")
      .split(/\r?\n/)
      .filter((r) => r && !r.startsWith("DATABASE_URL=") && !r.startsWith("DIRECT_URL=") && !r.startsWith("#"))
  : [];

const contenuto = [
  '# Postgres condiviso delle app Deluxy (stesso cluster di hub/tasks/calendario), schema "personale"',
  `DATABASE_URL="${db}"`,
  `DIRECT_URL="${direct}"`,
  ...esistenti,
  "",
].join("\n");

writeFileSync(destinazione, contenuto);
console.log("Scritto .env con schema=personale (stringhe di connessione non mostrate).");
console.log("Ora lancia: npm run db:push");

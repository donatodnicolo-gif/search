// Configura il .env di questa app copiando DATABASE_URL e DIRECT_URL dal file
// env di un'altra app Deluxy (stesso cluster Postgres) e impostando lo schema
// dedicato "acquisti". Preserva le eventuali chiavi già presenti nel .env
// locale (OpenAI, password). Non stampa mai le stringhe di connessione.
//
// Uso: npm run db:condiviso -- <percorso-env-sorgente>
// Es.: npm run db:condiviso -- ../deluxy-hub/.env.vercel-prod
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const sorgente = process.argv.slice(2).find((a) => a !== "--");
if (!sorgente) {
  console.error("Uso: npm run db:condiviso -- <percorso-env-sorgente>");
  process.exit(1);
}

const righe = readFileSync(resolve(sorgente), "utf8").split(/\r?\n/);

function prendi(nome, fonte = righe) {
  const riga = fonte.find((r) => r.startsWith(nome + "="));
  if (!riga) return null;
  let v = riga.slice(nome.length + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v;
}

function conSchema(url) {
  if (!url) return null;
  if (/[?&]schema=/.test(url)) return url.replace(/([?&]schema=)[^&]*/, "$1acquisti");
  return url + (url.includes("?") ? "&" : "?") + "schema=acquisti";
}

const db = conSchema(prendi("DATABASE_URL"));
const direct = conSchema(prendi("DIRECT_URL"));
if (!db || !direct) {
  console.error("DATABASE_URL o DIRECT_URL mancanti nel file sorgente");
  process.exit(1);
}

// Preserva chiavi non-DB dal .env locale, se esiste.
const envLocale = new URL("../.env", import.meta.url);
const preesistenti = existsSync(envLocale) ? readFileSync(envLocale, "utf8").split(/\r?\n/) : [];
const conserva = ["ACQUISTI_APP_PASSWORD", "ACQUISTI_APPROVATORI", "OPENAI_API_KEY", "OPENAI_MODEL"];

const contenuto = [
  '# Postgres condiviso delle app Deluxy (stesso cluster di hub/anagrafiche), schema "acquisti"',
  `DATABASE_URL="${db}"`,
  `DIRECT_URL="${direct}"`,
];
for (const nome of conserva) {
  const v = prendi(nome, preesistenti);
  if (v != null) contenuto.push(`${nome}="${v}"`);
}
contenuto.push("");

writeFileSync(envLocale, contenuto.join("\n"));
console.log("Scritto .env con schema=acquisti (stringhe di connessione non mostrate).");
console.log("Ora lancia: npm run db:push");

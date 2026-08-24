// GUARDIA: i comandi che cancellano (db:seed, db:reset) girano SOLO su un
// database locale. Importata in testa a seed.mjs e messa davanti a db:reset.
//
// Storia (audit 24/08/2026): DATABASE_URL di questa cartella punta al cluster
// Postgres condiviso di produzione, schema `merchandising`. Il seed apre con
// sette deleteMany() senza filtro — giusti per un dev.db locale, catastrofici
// lì: un `npm run db:seed` lanciato per abitudine avrebbe svuotato il PLM vero.
// Regola del repo: mai cancellazioni globali sul Postgres condiviso.
//
// «Locale» = localhost / 127.0.0.1 / SQLite. Tutto il resto è produzione, e si
// blocca PRIMA di aprire la connessione, qualunque sia l'intenzione.

import { readFileSync } from "fs";

function urlDatabase() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // `node prisma/seed.mjs` non carica il .env da solo, ma Prisma Client sì:
  // la guardia deve vedere lo stesso valore che vedrà lui.
  try {
    const testo = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const riga = testo.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)/m);
    return riga ? riga[1] : "";
  } catch {
    return "";
  }
}

const url = urlDatabase();
const locale = /localhost|127\.0\.0\.1|^file:/.test(url);

if (!locale) {
  console.error(
    "⛔ BLOCCATO: questo comando cancella dati e DATABASE_URL non è un database locale.\n" +
      "   Punta a: " + (url ? url.replace(/\/\/[^@]*@/, "//***@").slice(0, 80) + "…" : "(vuoto)") + "\n" +
      "   Il seed è dimostrativo: si usa solo su localhost o su un file SQLite.\n" +
      "   Sul database condiviso non esiste un motivo legittimo per lanciarlo."
  );
  process.exit(1);
}

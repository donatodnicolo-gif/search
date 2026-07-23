// Carica in un database vuoto il file prodotto da esporta-dati.mjs.
// Serve per portare i dati da SQLite (sviluppo) a Postgres (produzione).
//
//   npm run importa -- dati-marketing.json
//
// Idempotente per quanto possibile: usa createMany con skipDuplicates dove il
// database lo supporta (Postgres), altrimenti inserisce riga per riga saltando
// quelle già presenti. Rilanciarlo non duplica: gli id sono gli stessi.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import { ORDINE_TABELLE } from "./tabelle.mjs";

const prisma = new PrismaClient();
const sorgente = process.argv.slice(2).filter((a) => a !== "--")[0];
if (!sorgente) {
  console.error("Uso: npm run importa -- <file.json>");
  process.exit(1);
}
if (!fs.existsSync(sorgente)) {
  console.error(`File non trovato: ${sorgente}`);
  process.exit(1);
}

const contenuto = JSON.parse(fs.readFileSync(sorgente, "utf8"));
const dati = contenuto.dati ?? contenuto;
console.log(`Importo da ${sorgente} (esportato il ${contenuto.esportatoIl ?? "?"})\n`);

// Le date arrivano come stringhe ISO: Prisma vuole oggetti Date.
const CAMPI_DATA = /Il$|^data$|^inizio$|^fine$|^prevista$|^scadenza$|^giorno$|^modificatoIl$/;
function ravviva(riga) {
  const fuori = {};
  for (const [k, v] of Object.entries(riga)) {
    if (typeof v === "string" && CAMPI_DATA.test(k) && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
      fuori[k] = new Date(v);
    } else {
      fuori[k] = v;
    }
  }
  return fuori;
}

let totale = 0;
let saltate = 0;
for (const tabella of ORDINE_TABELLE) {
  const righe = dati[tabella];
  if (!Array.isArray(righe) || righe.length === 0) continue;
  const modello = prisma[tabella];
  if (!modello) {
    console.warn(`  ⚠ tabella sconosciuta, saltata: ${tabella}`);
    continue;
  }

  const pronte = righe.map(ravviva);
  try {
    // Postgres: un colpo solo, saltando i duplicati
    const esito = await modello.createMany({ data: pronte, skipDuplicates: true });
    totale += esito.count;
    saltate += pronte.length - esito.count;
    console.log(`  ${tabella}: ${esito.count} inserite${pronte.length - esito.count ? `, ${pronte.length - esito.count} già presenti` : ""}`);
  } catch {
    // Ripiego riga per riga (utile anche su SQLite)
    let ok = 0;
    for (const riga of pronte) {
      try {
        await modello.create({ data: riga });
        ok++;
      } catch {
        saltate++;
      }
    }
    totale += ok;
    console.log(`  ${tabella}: ${ok} inserite (una alla volta)`);
  }
}

console.log(`\nImportate ${totale} righe${saltate ? ` · ${saltate} già presenti o scartate` : ""}.`);
await prisma.$disconnect();

// Esporta TUTTO il database in un unico file JSON, per portarlo da SQLite
// (sviluppo) a Postgres (produzione) senza perdere niente.
//
//   npm run esporta            → dati-marketing.json nella cartella dell'app
//   npm run esporta -- <file>  → percorso a scelta
//
// L'ordine delle tabelle rispetta le dipendenze: chi viene prima non ha
// bisogno di chi viene dopo. Lo stesso ordine lo usa importa-dati.mjs.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import { ORDINE_TABELLE } from "./tabelle.mjs";

const prisma = new PrismaClient();
const destinazione =
  process.argv.slice(2).filter((a) => a !== "--")[0] ?? "dati-marketing.json";


const dati = {};
let totale = 0;
for (const tabella of ORDINE_TABELLE) {
  const modello = prisma[tabella];
  if (!modello) {
    console.warn(`  ⚠ tabella sconosciuta, saltata: ${tabella}`);
    continue;
  }
  const righe = await modello.findMany();
  dati[tabella] = righe;
  totale += righe.length;
  if (righe.length > 0) console.log(`  ${tabella}: ${righe.length}`);
}

fs.writeFileSync(destinazione, JSON.stringify({ esportatoIl: new Date().toISOString(), dati }, null, 1));
const mb = (fs.statSync(destinazione).size / 1024 / 1024).toFixed(1);
console.log(`\nEsportate ${totale} righe in ${destinazione} (${mb} MB)`);
console.log("Per caricarle in produzione: npm run importa -- " + destinazione);
await prisma.$disconnect();

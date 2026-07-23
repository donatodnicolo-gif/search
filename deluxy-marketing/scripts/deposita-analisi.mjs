// Deposita un'analisi scrivendo direttamente nel database (senza server web).
// Pensato per le sessioni Claude programmate (analisi quotidiana del Drive).
//   node scripts/deposita-analisi.mjs '<json>'
//   echo '<json>' | node scripts/deposita-analisi.mjs
// JSON: { titolo*, sintesi*, tipo?, brand?, canale?, esito?, fileDrive?, origine?, note?,
//         azioni?: [{ titolo*, descrizione?, priorita?, owner?, scadenza? }] }
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

let grezzo = process.argv.slice(2).filter((a) => a !== "--")[0];
if (!grezzo) {
  grezzo = await new Promise((resolve) => {
    let dati = "";
    process.stdin.on("data", (c) => (dati += c));
    process.stdin.on("end", () => resolve(dati));
  });
}
let body;
try {
  body = JSON.parse(grezzo);
} catch {
  console.error("JSON non valido. Uso: node scripts/deposita-analisi.mjs '<json>'");
  process.exit(1);
}
if (!body.titolo || !body.sintesi) {
  console.error("Campi obbligatori: titolo, sintesi");
  process.exit(1);
}

const azioni = Array.isArray(body.azioni) ? body.azioni.filter((a) => a?.titolo) : [];
const origine = body.origine ?? "analisi-quotidiana";
const analisi = await prisma.analisi.create({
  data: {
    titolo: String(body.titolo),
    sintesi: String(body.sintesi),
    tipo: body.tipo ?? "analisi",
    brand: body.brand ?? "cross",
    canale: body.canale ?? null,
    esito: body.esito ?? null,
    fileDrive: body.fileDrive ?? null,
    origine,
    note: body.note ?? null,
    azioni: {
      create: azioni.map((a) => ({
        titolo: String(a.titolo),
        descrizione: a.descrizione ?? null,
        brand: body.brand ?? "cross",
        priorita: a.priorita ?? "media",
        owner: a.owner ?? "utente",
        scadenza: a.scadenza ? new Date(a.scadenza) : null,
        eventi: { create: { tipo: "creazione", autore: origine, testo: "Creata dall'analisi quotidiana" } },
      })),
    },
  },
});
await prisma.registroEvento.create({
  data: {
    autore: origine,
    tipo: "creazione",
    entita: "analisi",
    entitaId: analisi.id,
    titolo: `Analisi depositata: ${analisi.titolo}`,
    dettaglio: azioni.length ? `${azioni.length} azioni proposte` : null,
  },
});
console.log(`Analisi depositata (${analisi.id})${azioni.length ? ` con ${azioni.length} azioni` : ""}`);
await prisma.$disconnect();

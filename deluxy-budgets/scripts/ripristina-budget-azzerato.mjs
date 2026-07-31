// Ripristino del budget D2C di Deluxy.it su gennaio-giugno 2026, azzerato dal
// consolidamento di una proposta che portava con sé degli zeri sui mesi già
// chiusi (31/07/2026).
//
// I valori sono quelli del seed (`prisma/seed-data.json`, estratti da
// "Monitoraggio 2026.xlsx" foglio SALES GLOBAL 26 - REVISED): sono la fonte da
// cui il budget era nato, e la somma torna al totale verificato di 1.492.440 €.
//
// Senza "scrivi" è una prova a vuoto: stampa cosa farebbe e non tocca niente.
// Tocca SOLO i sei mesi indicati e SOLO il canale D2C di quella maison.

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();
const scrivi = process.argv.includes("scrivi");
const SLUG = "deluxy";
const CANALE = "D2C";
const MESI = [1, 2, 3, 4, 5, 6];
const YEAR = 2026;

const seed = JSON.parse(readFileSync("prisma/seed-data.json", "utf8"));
const daSeed = seed.maisons.find((m) => m.slug === SLUG);

const maison = await prisma.maison.findUnique({ where: { slug: SLUG } });
if (!maison) throw new Error("maison non trovata");

let mosso = 0;
for (const month of MESI) {
  const atteso = daSeed.months.find((x) => x.month === month)?.d2c ?? 0;
  const riga = await prisma.budgetEntry.findUnique({
    where: { year_maisonId_month_canale: { year: YEAR, maisonId: maison.id, month, canale: CANALE } },
  });
  const ora = riga?.vendite ?? 0;
  // Non si sovrascrive un valore che non è zero: se qualcuno nel frattempo ha
  // scritto un numero vero, quello è una decisione e questo script non è
  // autorizzato a cancellarla.
  if (ora !== 0) {
    console.log(`m${month}: ${ora} — NON tocco, non è zero`);
    continue;
  }
  console.log(`m${month}: ${ora} -> ${atteso}`);
  mosso += atteso;
  if (scrivi) {
    await prisma.budgetEntry.upsert({
      where: { year_maisonId_month_canale: { year: YEAR, maisonId: maison.id, month, canale: CANALE } },
      create: { year: YEAR, maisonId: maison.id, month, canale: CANALE, vendite: atteso },
      update: { vendite: atteso },
    });
  }
}

const tot = await prisma.budgetEntry.aggregate({
  where: { year: YEAR, maisonId: maison.id },
  _sum: { vendite: true },
});
console.log(`\n${scrivi ? "SCRITTO" : "PROVA A VUOTO"} — ${Math.round(mosso).toLocaleString("it-IT")} € rimessi`);
console.log(`totale maison ora: ${Math.round(tot._sum.vendite ?? 0).toLocaleString("it-IT")} €`);
await prisma.$disconnect();

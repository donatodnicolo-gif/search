// Seed 2026 — dati estratti da "Monitoraggio 2026.xlsx" (foglio SALES GLOBAL
// 26 - REVISED: budget vendite/ADV mensili per maison) e da "budget
// pubblicati.xlsx" (foglio TARGET NUOVI CLIENTI: linee commerciali).
// Rilanciabile: usa upsert, non duplica.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();
const data = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "seed-data.json"), "utf8")
);
const YEAR = data.year;

// Scenari: il "raggiungibile" è il budget pubblicato (moltiplicatore 1).
// Moltiplicatori e premi sono modificabili da /impostazioni.
const SCENARI = [
  { livello: "RAGGIUNGIBILE", moltiplicatore: 1, premio: 0, note: "Budget pubblicato 2026" },
  { livello: "SFIDANTE", moltiplicatore: 1.15, premio: 0, note: "+15% sul pubblicato (modificabile)" },
  { livello: "IRRAGGIUNGIBILE", moltiplicatore: 1.35, premio: 0, note: "+35% sul pubblicato (modificabile)" },
];

// Costi di struttura da impostare. Il costo del venduto non è più una
// percentuale unica: dipende dal margine di ciascuna tipologia di servizio.
const COSTI = [{ tipo: "FISSO_MENSILE", label: "Costi di struttura mensili", valore: 0 }];

// Tipologie di servizio con il margine di partenza: 35% è il margine stimato
// 2026 dei budget pubblicati. Modificabili (e ampliabili) da /margini.
const TIPOLOGIE = [
  { slug: "D2C", nome: "D2C", marginePct: 35, ordine: 0 },
  { slug: "EVENTI", nome: "Eventi", marginePct: 35, ordine: 1 },
  { slug: "B2B", nome: "B2B", marginePct: 35, ordine: 2 },
];

async function main() {
  for (const t of TIPOLOGIE) {
    await prisma.tipologiaServizio.upsert({
      where: { slug: t.slug },
      update: {}, // il margine impostato a mano non va sovrascritto
      create: t,
    });
  }

  for (const [i, m] of data.maisons.entries()) {
    const maison = await prisma.maison.upsert({
      where: { slug: m.slug },
      update: { nome: m.nome, ordine: i },
      create: { slug: m.slug, nome: m.nome, ordine: i },
    });
    const totV = m.months.reduce((s, x) => s + x.d2c + x.eventi + x.b2b, 0);
    const totA = m.months.reduce((s, x) => s + x.adv, 0);
    const pctMedia = totV > 0 ? (totA / totV) * 100 : 0;
    for (const row of m.months) {
      for (const [canale, vendite] of [
        ["D2C", row.d2c],
        ["EVENTI", row.eventi],
        ["B2B", row.b2b],
      ]) {
        await prisma.budgetEntry.upsert({
          where: {
            year_maisonId_month_canale: {
              year: YEAR, maisonId: maison.id, month: row.month, canale,
            },
          },
          update: { vendite },
          create: { year: YEAR, maisonId: maison.id, month: row.month, canale, vendite },
        });
      }
      const venditeTot = row.d2c + row.eventi + row.b2b;
      const percent =
        venditeTot > 0 ? Math.round((row.adv / venditeTot) * 1000) / 10 : Math.round(pctMedia * 10) / 10;
      await prisma.advPercent.upsert({
        where: { year_maisonId_month: { year: YEAR, maisonId: maison.id, month: row.month } },
        update: { percent, budgetPubblicato: row.adv },
        create: {
          year: YEAR, maisonId: maison.id, month: row.month, percent, budgetPubblicato: row.adv,
        },
      });
    }
  }

  for (const [i, l] of data.linee.entries()) {
    const linea = await prisma.lineaCommerciale.upsert({
      where: { slug: l.slug },
      update: { nome: l.nome, ordine: i },
      create: { slug: l.slug, nome: l.nome, ordine: i },
    });
    for (const t of l.months) {
      await prisma.targetLinea.upsert({
        where: { year_lineaId_month: { year: YEAR, lineaId: linea.id, month: t.month } },
        update: { valore: t.valore, clienti: t.clienti },
        create: { year: YEAR, lineaId: linea.id, month: t.month, valore: t.valore, clienti: t.clienti },
      });
    }
  }

  for (const s of SCENARI) {
    await prisma.scenarioConfig.upsert({
      where: { year_livello: { year: YEAR, livello: s.livello } },
      update: {},
      create: { year: YEAR, ...s },
    });
  }

  for (const c of COSTI) {
    const found = await prisma.costConfig.findFirst({
      where: { year: YEAR, tipo: c.tipo, maisonId: null },
    });
    if (!found) await prisma.costConfig.create({ data: { year: YEAR, ...c } });
  }

  const nMaison = await prisma.maison.count();
  const nEntry = await prisma.budgetEntry.count();
  const nLinee = await prisma.lineaCommerciale.count();
  console.log(`Seed ${YEAR} ok: ${nMaison} maison, ${nEntry} righe budget, ${nLinee} linee commerciali.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

// Crea la tabella marketing."LocalitaCampagna".
//
// ⚠️ CREATE TABLE mirato, NON `prisma db push`: il Postgres è condiviso fra sei
// app e un push confronta l'INTERO schema. Stessa regola di
// `Campagna.nomeVisibile` (04/08), `CopyAnnuncio.metricheGiorni` (08/08) e
// `Campagna.account` (09/08).
//
//   node scripts/crea-tabella-localita.mjs
//
// Ripetibile: `IF NOT EXISTS` lo rende innocuo se la tabella c'è già.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SQL = [
  `CREATE TABLE IF NOT EXISTS marketing."LocalitaCampagna" (
     "id"           TEXT PRIMARY KEY,
     "campagnaId"   TEXT NOT NULL,
     "idEsterno"    TEXT NOT NULL,
     "nome"         TEXT NOT NULL,
     "tipo"         TEXT,
     "esclusa"      BOOLEAN NOT NULL DEFAULT false,
     "modificatore" DOUBLE PRECISION,
     "creataIl"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "aggiornataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  // ⚠️ `esclusa` fa parte della chiave: la stessa località può essere mirata
  // come regione ed esclusa come città dentro, ed è una configurazione normale.
  `CREATE UNIQUE INDEX IF NOT EXISTS "LocalitaCampagna_campagnaId_idEsterno_esclusa_key"
     ON marketing."LocalitaCampagna" ("campagnaId", "idEsterno", "esclusa")`,
  `CREATE INDEX IF NOT EXISTS "LocalitaCampagna_campagnaId_idx"
     ON marketing."LocalitaCampagna" ("campagnaId")`,
];

try {
  for (const q of SQL) await prisma.$executeRawUnsafe(q);

  // La chiave esterna a parte: se c'è già, `ADD CONSTRAINT` fallisce e va
  // ignorato — non esiste `IF NOT EXISTS` per i vincoli in Postgres.
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE marketing."LocalitaCampagna"
         ADD CONSTRAINT "LocalitaCampagna_campagnaId_fkey"
         FOREIGN KEY ("campagnaId") REFERENCES marketing."Campagna"("id")
         ON DELETE CASCADE ON UPDATE CASCADE`
    );
    console.log("chiave esterna creata.");
  } catch (e) {
    if (/already exists|esiste/i.test(e.message)) console.log("chiave esterna: c'era già.");
    else throw e;
  }

  const [{ n }] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'marketing' AND table_name = 'LocalitaCampagna'`
  );
  console.log(n === 1 ? "tabella LocalitaCampagna presente." : "ERRORE: la tabella non risulta.");
} catch (e) {
  console.error("ERRORE:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

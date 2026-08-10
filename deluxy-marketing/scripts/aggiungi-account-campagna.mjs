// Aggiunge Campagna.account e Campagna.brandManuale.
//
// ⚠️ ALTER TABLE mirato, NON `prisma db push`: il Postgres è condiviso fra sei
// app e un push confronta l'INTERO schema. Stessa regola di
// `Campagna.nomeVisibile` (04/08) e `CopyAnnuncio.metricheGiorni` (08/08).
//
//   node scripts/aggiungi-account-campagna.mjs
//
// Ripetibile: `IF NOT EXISTS` lo rende innocuo se le colonne ci sono già.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE marketing."Campagna" ADD COLUMN IF NOT EXISTS "account" TEXT`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE marketing."Campagna" ADD COLUMN IF NOT EXISTS "brandManuale" BOOLEAN NOT NULL DEFAULT false`
  );
  const righe = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'marketing' AND table_name = 'Campagna'
       AND column_name IN ('account', 'brandManuale')
     ORDER BY column_name`
  );
  console.log("colonne presenti:", righe.map((r) => r.column_name).join(", ") || "NESSUNA");
} catch (e) {
  console.error("ERRORE:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

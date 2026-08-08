// Aggiunge la colonna CopyAnnuncio.metricheGiorni.
//
// ⚠️ ALTER TABLE mirato, NON `prisma db push`: il Postgres è condiviso fra sei
// app e un push confronta l'INTERO schema, quindi tocca anche tabelle che non
// sono nostre. Stessa regola già usata per `Campagna.nomeVisibile` (04/08/2026).
//
//   node scripts/aggiungi-metriche-giorni.mjs
//
// È ripetibile: `IF NOT EXISTS` lo rende innocuo se la colonna c'è già.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE marketing."CopyAnnuncio" ADD COLUMN IF NOT EXISTS "metricheGiorni" INTEGER`
  );
  const [{ presente }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS presente FROM information_schema.columns
     WHERE table_schema = 'marketing' AND table_name = 'CopyAnnuncio'
       AND column_name = 'metricheGiorni'`
  );
  console.log(presente === 1 ? "colonna metricheGiorni presente." : "ERRORE: la colonna non risulta.");
} catch (e) {
  console.error("ERRORE:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

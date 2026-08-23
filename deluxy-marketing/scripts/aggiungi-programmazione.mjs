// Aggiunge la colonna `daEseguireDal` alle operazioni: la data da cui possono
// partire.
//
// ⚠️ ALTER mirato, NON `prisma db push`: il Postgres è condiviso fra tredici
// app e un push confronta l'intero schema.
//
//   node scripts/aggiungi-programmazione.mjs
//
// Ripetibile: IF NOT EXISTS lo rende innocuo.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE marketing."OperazioneAdv" ADD COLUMN IF NOT EXISTS "daEseguireDal" TIMESTAMP(3)`
  );
  // Serve a chi esegue: filtra su questa colonna a ogni giro.
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "OperazioneAdv_daEseguireDal_idx" ON marketing."OperazioneAdv"("daEseguireDal")`
  );
  const c = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='marketing' AND table_name='OperazioneAdv' AND column_name='daEseguireDal'`
  );
  console.log(c.length ? "colonna daEseguireDal presente" : "NON creata");
} finally {
  await prisma.$disconnect();
}

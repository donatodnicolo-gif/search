// Crea la tabella BozzaAnnuncio: l'annuncio in scrittura, salvato mentre si
// scrive, così si può riprendere dopo o in un altro giorno.
//
// ⚠️ CREATE mirato, NON `prisma db push`: il Postgres è condiviso fra tredici
// app e un push confronta l'intero schema.
//
//   node scripts/crea-tabella-bozza-annuncio.mjs
//
// Ripetibile: IF NOT EXISTS lo rende innocuo.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS marketing."BozzaAnnuncio" (
      "id"           TEXT NOT NULL,
      "gruppoId"     TEXT NOT NULL,
      "titoli"       TEXT,
      "descrizioni"  TEXT,
      "finalUrl"     TEXT,
      "indicazione"  TEXT,
      "creataIl"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "aggiornataIl" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "BozzaAnnuncio_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "BozzaAnnuncio_gruppoId_fkey" FOREIGN KEY ("gruppoId")
        REFERENCES marketing."Gruppo"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  // Una bozza per gruppo: è la stessa casella su cui si stava scrivendo, non
  // una collezione di tentativi.
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "BozzaAnnuncio_gruppoId_key"
     ON marketing."BozzaAnnuncio"("gruppoId")`
  );

  const colonne = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'marketing' AND table_name = 'BozzaAnnuncio'
     ORDER BY ordinal_position`
  );
  console.log("BozzaAnnuncio:", colonne.map((c) => c.column_name).join(", ") || "(non creata)");
} finally {
  await prisma.$disconnect();
}

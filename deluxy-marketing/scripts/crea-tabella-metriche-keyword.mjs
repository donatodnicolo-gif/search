// Crea la tabella MetricaKeyword: la STORIA giorno per giorno delle keyword
// (una riga per criterio per giorno con impressioni), quella che permette
// alla tabella delle keyword di seguire il periodo scelto invece di mostrare
// una fotografia a finestra fissa.
//
// ⚠️ CREATE mirato, NON `prisma db push`: il Postgres è condiviso.
//
//   node scripts/crea-tabella-metriche-keyword.mjs
//
// Ripetibile: IF NOT EXISTS lo rende innocuo.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS marketing."MetricaKeyword" (
      "id"             TEXT NOT NULL,
      "idEsterno"      TEXT NOT NULL,
      "campagna"       TEXT NOT NULL,
      "gruppo"         TEXT,
      "testo"          TEXT NOT NULL,
      "corrispondenza" TEXT,
      "data"           TIMESTAMP(3) NOT NULL,
      "spesa"          DOUBLE PRECISION,
      "impressioni"    INTEGER,
      "clic"           INTEGER,
      "conversioni"    DOUBLE PRECISION,
      "ricavi"         DOUBLE PRECISION,
      "creataIl"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "aggiornataIl"   TIMESTAMP(3) NOT NULL,
      CONSTRAINT "MetricaKeyword_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "MetricaKeyword_idEsterno_data_key"
     ON marketing."MetricaKeyword"("idEsterno", "data")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "MetricaKeyword_campagna_data_idx"
     ON marketing."MetricaKeyword"("campagna", "data")`
  );
  const righe = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'marketing' AND table_name = 'MetricaKeyword'`
  );
  console.log("tabella MetricaKeyword:", righe.length > 0 ? "presente" : "ASSENTE");
} catch (e) {
  console.error("ERRORE:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

// Crea la tabella MetricaAnnuncio: la storia giorno per giorno di ogni
// annuncio (una riga per annuncio per giorno con impressioni), gemella di
// MetricaKeyword. Serve a far vedere le prestazioni di un annuncio per
// finestra invece della sola fotografia a 30 giorni.
//
// ⚠️ CREATE mirato, NON `prisma db push`: il Postgres è condiviso.
//
//   node scripts/crea-tabella-metriche-annuncio.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS marketing."MetricaAnnuncio" (
      "id"           TEXT NOT NULL,
      "idEsterno"    TEXT NOT NULL,
      "campagna"     TEXT NOT NULL,
      "gruppo"       TEXT,
      "data"         TIMESTAMP(3) NOT NULL,
      "spesa"        DOUBLE PRECISION,
      "impressioni"  INTEGER,
      "clic"         INTEGER,
      "conversioni"  DOUBLE PRECISION,
      "ricavi"       DOUBLE PRECISION,
      "creataIl"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "aggiornataIl" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "MetricaAnnuncio_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "MetricaAnnuncio_idEsterno_data_key"
     ON marketing."MetricaAnnuncio"("idEsterno", "data")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "MetricaAnnuncio_campagna_data_idx"
     ON marketing."MetricaAnnuncio"("campagna", "data")`
  );
  const righe = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'marketing' AND table_name = 'MetricaAnnuncio'`
  );
  console.log("tabella MetricaAnnuncio:", righe.length > 0 ? "presente" : "ASSENTE");
} catch (e) {
  console.error("ERRORE:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

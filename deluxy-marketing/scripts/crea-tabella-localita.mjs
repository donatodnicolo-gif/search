// Crea la tabella LocalitaCampagna (il modello nello schema esisteva dal
// 09/08 ma non era mai stato cablato: nessuna tabella, nessun ingest).
// E toglie due colonne aggiunte per sbaglio il 10/08 su Campagna
// (localita/localitaEscluse): la forma giusta è la tabella, non due TEXT.
//
// ⚠️ CREATE/ALTER mirati, NON `prisma db push`: il Postgres è condiviso.
//
//   node scripts/crea-tabella-localita.mjs
//
// Ripetibile: IF NOT EXISTS / IF EXISTS lo rendono innocuo.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS marketing."LocalitaCampagna" (
      "id"           TEXT NOT NULL,
      "campagnaId"   TEXT NOT NULL,
      "idEsterno"    TEXT NOT NULL,
      "nome"         TEXT NOT NULL,
      "tipo"         TEXT,
      "esclusa"      BOOLEAN NOT NULL DEFAULT false,
      "modificatore" DOUBLE PRECISION,
      "creataIl"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "aggiornataIl" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "LocalitaCampagna_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "LocalitaCampagna_campagnaId_fkey" FOREIGN KEY ("campagnaId")
        REFERENCES marketing."Campagna"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "LocalitaCampagna_campagnaId_idEsterno_esclusa_key"
     ON marketing."LocalitaCampagna"("campagnaId", "idEsterno", "esclusa")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "LocalitaCampagna_campagnaId_idx"
     ON marketing."LocalitaCampagna"("campagnaId")`
  );
  // Le due colonne sbagliate: appena nate, vuote, mai lette da nessuno.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE marketing."Campagna" DROP COLUMN IF EXISTS "localita"`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE marketing."Campagna" DROP COLUMN IF EXISTS "localitaEscluse"`
  );
  const righe = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'marketing' AND table_name = 'LocalitaCampagna'`
  );
  console.log("tabella LocalitaCampagna:", righe.length > 0 ? "presente" : "ASSENTE");
  const colonne = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'marketing' AND table_name = 'Campagna'
       AND column_name IN ('localita', 'localitaEscluse')`
  );
  console.log("colonne spurie su Campagna:", colonne.length === 0 ? "rimosse" : colonne.map((c) => c.column_name).join(", "));
} catch (e) {
  console.error("ERRORE:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

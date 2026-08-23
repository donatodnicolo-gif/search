// Crea la tabella delle keyword NEGATIVE censite su Google (`NegativaCampagna`).
//
// ⚠️ CREATE mirato, NON `prisma db push`: il Postgres è condiviso fra quattordici
// app e un push confronta l'intero schema — su un database che non è solo
// nostro, «sincronizza tutto» è il comando con cui si cancella la roba altrui.
//
//   node scripts/crea-tabella-negative.mjs
//
// Ripetibile: IF NOT EXISTS lo rende innocuo.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS marketing."NegativaCampagna" (
      "id"             TEXT NOT NULL,
      "account"        TEXT NOT NULL,
      "campagna"       TEXT NOT NULL,
      "campagnaId"     TEXT,
      "livello"        TEXT NOT NULL DEFAULT 'campagna',
      "gruppo"         TEXT,
      "idEsterno"      TEXT NOT NULL,
      "testo"          TEXT NOT NULL,
      "corrispondenza" TEXT NOT NULL DEFAULT 'broad',
      "vistaIl"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "creataIl"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "NegativaCampagna_pkey" PRIMARY KEY ("id")
    )
  `);

  // `idEsterno` porta dentro l'account (account:campagna:criterio): è la chiave
  // del censimento, e senza l'unicità un giro ripetuto scriverebbe doppioni
  // invece di aggiornare `vistaIl` — cioè proprio il campo su cui si decide se
  // una negativa c'è ancora.
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "NegativaCampagna_idEsterno_key" ON marketing."NegativaCampagna"("idEsterno")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "NegativaCampagna_account_campagna_idx" ON marketing."NegativaCampagna"("account", "campagna")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "NegativaCampagna_campagnaId_idx" ON marketing."NegativaCampagna"("campagnaId")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "NegativaCampagna_vistaIl_idx" ON marketing."NegativaCampagna"("vistaIl")`
  );

  const n = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM marketing."NegativaCampagna"`
  );
  console.log(`Tabella NegativaCampagna pronta (${n[0].n} righe).`);
} finally {
  await prisma.$disconnect();
}

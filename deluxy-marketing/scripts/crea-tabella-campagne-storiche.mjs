// Crea la tabella del CENSIMENTO STORICO delle campagne (`CampagnaStorica`).
//
// ⚠️ CREATE mirato, NON `prisma db push`: il Postgres è condiviso fra quattordici
// app e un push confronta l'intero schema — su un database che non è solo
// nostro, «sincronizza tutto» è il comando con cui si cancella la roba altrui.
//
//   node scripts/crea-tabella-campagne-storiche.mjs
//
// Ripetibile: IF NOT EXISTS lo rende innocuo.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS marketing."CampagnaStorica" (
      "id"          TEXT NOT NULL,
      "canale"      TEXT NOT NULL DEFAULT 'google_ads',
      "account"     TEXT NOT NULL,
      "idEsterno"   TEXT NOT NULL,
      "nome"        TEXT NOT NULL,
      "anno"        INTEGER NOT NULL,
      "stato"       TEXT,
      "tipo"        TEXT,
      "brand"       TEXT,
      "spesa"       DOUBLE PRECISION NOT NULL DEFAULT 0,
      "impression"  INTEGER NOT NULL DEFAULT 0,
      "click"       INTEGER NOT NULL DEFAULT 0,
      "conversioni" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "ricavi"      DOUBLE PRECISION NOT NULL DEFAULT 0,
      "primoMese"   INTEGER,
      "ultimoMese"  INTEGER,
      "mesiAttivi"  INTEGER NOT NULL DEFAULT 0,
      "vistoIl"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "creataIl"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CampagnaStorica_pkey" PRIMARY KEY ("id")
    )
  `);

  // ⚠️ È l'unicità che rende il censimento RIPETIBILE: senza, rifarlo
  // sommerebbe una seconda copia degli stessi anni e la risposta a «quante
  // campagne c'erano» raddoppierebbe da sola.
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "CampagnaStorica_canale_account_idEsterno_anno_key"
     ON marketing."CampagnaStorica"("canale", "account", "idEsterno", "anno")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "CampagnaStorica_anno_idx" ON marketing."CampagnaStorica"("anno")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "CampagnaStorica_idEsterno_idx" ON marketing."CampagnaStorica"("idEsterno")`
  );

  const n = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM marketing."CampagnaStorica"`
  );
  console.log(`Tabella CampagnaStorica pronta (${n[0].n} righe).`);
} finally {
  await prisma.$disconnect();
}

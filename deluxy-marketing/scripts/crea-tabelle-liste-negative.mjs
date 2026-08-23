// Crea le tabelle delle liste di parole escluse.
//
// ⚠️ CREATE mirato, NON `prisma db push`: il Postgres è condiviso fra tredici
// app e un push confronta l'intero schema — su un database che non è solo
// nostro, «sincronizza tutto» è il comando con cui si cancella la roba altrui.
//
//   node scripts/crea-tabelle-liste-negative.mjs
//
// Ripetibile: IF NOT EXISTS lo rende innocuo.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS marketing."ListaNegative" (
      "id"           TEXT NOT NULL,
      "nome"         TEXT NOT NULL,
      "descrizione"  TEXT,
      "creataIl"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "aggiornataIl" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "ListaNegative_pkey" PRIMARY KEY ("id")
    )
  `);
  // Il nome è la chiave con cui lo script ritrova la lista dentro Google Ads:
  // due liste omonime nell'app diventerebbero una sola là, e nessuno capirebbe
  // perché una campagna esclude parole che non ha mai visto.
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ListaNegative_nome_key" ON marketing."ListaNegative"("nome")`
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS marketing."ParolaListaNegative" (
      "id"             TEXT NOT NULL,
      "listaId"        TEXT NOT NULL,
      "testo"          TEXT NOT NULL,
      "corrispondenza" TEXT NOT NULL DEFAULT 'exact',
      "creataIl"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ParolaListaNegative_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ParolaListaNegative_listaId_fkey" FOREIGN KEY ("listaId")
        REFERENCES marketing."ListaNegative"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  // La stessa parola con la stessa corrispondenza non entra due volte: due
  // righe uguali diventerebbero due negative identiche su Google.
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ParolaListaNegative_listaId_testo_corrispondenza_key"
     ON marketing."ParolaListaNegative"("listaId", "testo", "corrispondenza")`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ParolaListaNegative_listaId_idx" ON marketing."ParolaListaNegative"("listaId")`
  );

  for (const t of ["ListaNegative", "ParolaListaNegative"]) {
    const colonne = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'marketing' AND table_name = $1
       ORDER BY ordinal_position`,
      t
    );
    console.log(`${t}: ${colonne.map((c) => c.column_name).join(", ") || "(non creata)"}`);
  }
} finally {
  await prisma.$disconnect();
}

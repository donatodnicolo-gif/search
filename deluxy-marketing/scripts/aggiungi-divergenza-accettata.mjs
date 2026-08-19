// Aggiunge a OperazioneAdv le due colonne del «è voluto»: quando qualcuno
// dichiara che la differenza fra l'app e Google è una sua decisione, e chi.
//
// Serve perché la conferma per operazione (17/08) fa vedere ogni divergenza
// fra quello che l'app crede e quello che Google riporta — ed è il suo mestiere
// — ma senza un modo di dire «lo so, è voluto» una divergenza accettata resta
// lì a segnalare per sempre. Un avviso che non si può chiudere si smette di
// leggere, e allora smette di funzionare anche per quelli veri.
//
// ⚠️ ALTER mirato, NON `prisma db push`: il Postgres è condiviso fra dodici app
// e un push confronta l'intero schema.
//
//   node scripts/aggiungi-divergenza-accettata.mjs
//
// Ripetibile: IF NOT EXISTS lo rende innocuo.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE marketing."OperazioneAdv"
     ADD COLUMN IF NOT EXISTS "divergenzaAccettataIl" TIMESTAMP(3)`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE marketing."OperazioneAdv"
     ADD COLUMN IF NOT EXISTS "divergenzaAccettataDa" TEXT`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE marketing."OperazioneAdv"
     ADD COLUMN IF NOT EXISTS "divergenzaMotivo" TEXT`
  );

  const colonne = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'marketing' AND table_name = 'OperazioneAdv'
       AND column_name LIKE 'divergenza%'
     ORDER BY column_name`
  );
  console.log("colonne presenti:", colonne.map((c) => c.column_name).join(", "));
} finally {
  await prisma.$disconnect();
}

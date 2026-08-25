// La SCHEDA delle analisi: le colonne per la rielaborazione grafica.
//
//   node scripts/aggiungi-scheda-analisi.mjs
//
// Cosa aggiunge, e perché qui e non con `prisma db push` (il Postgres è
// condiviso fra quattordici app: ALTER mirati, mai un confronto di schema):
//
//  - `Analisi.scheda`      — il JSON strutturato che l'AI estrae dal documento
//                            (verdetto, KPI, findings, azioni, campagne):
//                            è quello che la pagina rende in forma grafica.
//  - `Analisi.verdetto`    — rosso | giallo | verde, denormalizzato dalla
//                            scheda perché gli elenchi filtrano su di lui.
//  - `Analisi.elaborataIl` — quando l'AI ha prodotto la scheda.
//  - `Analisi.elaborataCon`— fornitore/modello: una scheda senza firma non si
//                            può giudicare quando i modelli cambiano.
//  - `DocumentoDrive.idDrive` — l'id del file su Google Drive. ⚠️ Senza,
//                            il contenuto NON si può scaricare via API: la
//                            sync lo vedeva (`voce.id`) e lo buttava via, e
//                            l'unico modo di leggere un documento era il
//                            disco G:\ del PC dell'utente.
//
// Ripetibile per costruzione: ADD COLUMN IF NOT EXISTS, nessun dato toccato.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  for (const sql of [
    `ALTER TABLE marketing."Analisi" ADD COLUMN IF NOT EXISTS "scheda" TEXT`,
    `ALTER TABLE marketing."Analisi" ADD COLUMN IF NOT EXISTS "verdetto" TEXT`,
    `ALTER TABLE marketing."Analisi" ADD COLUMN IF NOT EXISTS "elaborataIl" TIMESTAMP(3)`,
    `ALTER TABLE marketing."Analisi" ADD COLUMN IF NOT EXISTS "elaborataCon" TEXT`,
    `ALTER TABLE marketing."DocumentoDrive" ADD COLUMN IF NOT EXISTS "idDrive" TEXT`,
  ]) {
    await prisma.$executeRawUnsafe(sql);
    console.log("ok  " + sql.replace(/ALTER TABLE marketing\./, ""));
  }
  console.log("\nColonne pronte. Il riempimento di `idDrive` arriva dalla prossima sync via API.");
} finally {
  await prisma.$disconnect();
}

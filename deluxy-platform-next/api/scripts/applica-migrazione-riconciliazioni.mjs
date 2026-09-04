/**
 * RICONCILIAZIONI PRODOTTO × PROVINCIA (04/09/2026, regola utente — seconda
 * stesura): tabella platform."ProductReconciliation", una riga per coppia
 * (prodotto, provincia).
 *
 * ⚠️ La prima stesura (stessa sera) aveva creato la tabella con un'altra
 * forma (per prodotto, con l'AI). Se quella tabella esiste ed è VUOTA la si
 * ricrea; se contiene righe lo script si FERMA e lo dice — non si butta via
 * niente in silenzio. Idempotente sulla forma nuova.
 * Uso: node scripts/applica-migrazione-riconciliazioni.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();

const colonne = await prisma.$queryRawUnsafe(
  `SELECT column_name FROM information_schema.columns WHERE table_schema='platform' AND table_name='ProductReconciliation'`,
);
const nomi = colonne.map((c) => c.column_name);
const formaVecchia = nomi.length && !nomi.includes('provinceId');
if (formaVecchia) {
  const [{ n }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM platform."ProductReconciliation"`);
  // Le righe della forma vecchia sono proposte dell'AI mai decise: si buttano
  // SOLO con il flag esplicito (consenso dell'utente), mai in silenzio.
  if (n > 0 && !process.argv.includes('--butta-le-righe-vecchie')) {
    console.error(`⛔ La tabella nella forma vecchia contiene ${n} righe: non la butto senza --butta-le-righe-vecchie.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  if (n > 0) console.log(`⚠️ butto ${n} righe della forma vecchia (flag esplicito)`);
  await prisma.$executeRawUnsafe(`DROP TABLE platform."ProductReconciliation"`);
  console.log('✓ tabella vuota nella forma vecchia rimossa');
}

const SQL = [
  `CREATE TABLE IF NOT EXISTS platform."ProductReconciliation" (
     "id" TEXT PRIMARY KEY,
     "productId" TEXT NOT NULL REFERENCES platform."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
     "provinceId" TEXT NOT NULL,
     "partnerId" TEXT NOT NULL,
     "price" DOUBLE PRECISION NOT NULL,
     "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
     "salesCount" INTEGER NOT NULL DEFAULT 0,
     "stats" TEXT NOT NULL DEFAULT '[]',
     "lastSaleId" TEXT,
     "lastOrderNumber" TEXT,
     "status" TEXT NOT NULL DEFAULT 'proposta',
     "trigger" TEXT NOT NULL DEFAULT 'manuale',
     "decidedAt" TIMESTAMP(3),
     "decidedBy" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ProductReconciliation_productId_provinceId_key" ON platform."ProductReconciliation"("productId", "provinceId")`,
  `CREATE INDEX IF NOT EXISTS "ProductReconciliation_status_updatedAt_idx" ON platform."ProductReconciliation"("status", "updatedAt")`,
  // ⭐ 04/09/2026 (regola utente): il prezzo del patto è quello DATO AL PARTNER.
  `ALTER TABLE platform."ProductReconciliation" ADD COLUMN IF NOT EXISTS "partnerPrice" DOUBLE PRECISION`,
  // Sulle righe già scritte si ricava dai due campi che c'erano: nessuna perdita.
  `UPDATE platform."ProductReconciliation" SET "partnerPrice" = round(("price" * (1 - "discountPercent" / 100))::numeric, 2) WHERE "partnerPrice" IS NULL`,
];
for (const s of SQL) { await prisma.$executeRawUnsafe(s); console.log('✓', s.split('\n')[0].trim().slice(0, 80)); }
const [{ n }] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM platform."ProductReconciliation"`);
console.log(`righe: ${n}`);
await prisma.$disconnect();

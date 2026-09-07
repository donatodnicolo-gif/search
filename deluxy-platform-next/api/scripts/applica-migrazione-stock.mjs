/**
 * STOCK IN PIATTAFORMA (06/09/2026, regola utente; creazione autorizzata dall'utente
 * «crea anche questa tabella»): la tabella dei movimenti di magazzino.
 * Solo CREATE TABLE / INDEX IF NOT EXISTS: non tocca colonne né righe esistenti. Idempotente.
 * Uso: node scripts/applica-migrazione-stock.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();
await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS platform."StockMovement" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "productVariantId" TEXT,
  "deliveryId" TEXT,
  "quantity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StockMovement_productId_createdAt_idx" ON platform."StockMovement" ("productId", "createdAt")`);
await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "StockMovement_deliveryId_idx" ON platform."StockMovement" ("deliveryId")`);
const n = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM platform."StockMovement"`);
console.log('✓ tabella platform."StockMovement" pronta · righe:', n[0].n);
await prisma.$disconnect();

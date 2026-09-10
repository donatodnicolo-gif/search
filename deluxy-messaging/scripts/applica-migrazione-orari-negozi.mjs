/**
 * ORARI NEGOZI (10/09/2026, richiesta utente): la tabella con i giorni di apertura, le
 * fasce orarie di consegna e i giorni di chiusura di ogni negozio Shopify.
 * Idempotente e SOLO additiva (CREATE TABLE IF NOT EXISTS): qui non si usa mai
 * `prisma db push`, che proporrebbe di togliere le foreign key.
 * Uso: node scripts/applica-migrazione-orari-negozi.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
if (!process.env.DATABASE_URL) {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const riga = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
  if (riga) process.env.DATABASE_URL = riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
}
const p = new PrismaClient();
const q = (s) => p.$executeRawUnsafe(s);
await q(`CREATE TABLE IF NOT EXISTS messaging."OrarioNegozio" (
  "id" TEXT PRIMARY KEY,
  "negozioId" TEXT NOT NULL,
  "giorniApertura" TEXT NOT NULL DEFAULT '1,2,3,4,5,6',
  "fasce" TEXT NOT NULL DEFAULT '[]',
  "giorniChiusura" TEXT NOT NULL DEFAULT '[]',
  "nota" TEXT NOT NULL DEFAULT '',
  "modificatoDa" TEXT NULL,
  "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aggiornatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrarioNegozio_negozioId_fkey" FOREIGN KEY ("negozioId")
    REFERENCES messaging."NegozioShopify"("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
await q(`CREATE UNIQUE INDEX IF NOT EXISTS "OrarioNegozio_negozioId_key" ON messaging."OrarioNegozio" ("negozioId")`);
const n = await p.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM messaging."OrarioNegozio"`);
console.log('tabella pronta · righe:', n[0].n);
await p.$disconnect();

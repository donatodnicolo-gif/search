/**
 * LISTE DI PRODOTTO (06/09/2026 sera, regola utente): la tabella dei prezzi che un partner fa
 * su un prodotto — importati dalla piattaforma o raccolti come preventivo dal Customer Service.
 * Idempotente. Uso: node scripts/applica-migrazione-liste-prodotto.mjs
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
await q(`CREATE TABLE IF NOT EXISTS messaging."PrezzoProdottoPartner" (
  "id" TEXT PRIMARY KEY,
  "codice" TEXT NOT NULL,
  "prodotto" TEXT NOT NULL,
  "variante" TEXT NOT NULL DEFAULT '',
  "tipologia" TEXT NOT NULL,
  "mestiere" TEXT NOT NULL DEFAULT '',
  "provincia" TEXT NOT NULL DEFAULT '',
  "partnerId" TEXT NOT NULL,
  "partner" TEXT NOT NULL,
  "prezzo" DOUBLE PRECISION NOT NULL,
  "unita" TEXT NOT NULL DEFAULT '',
  "pubblico" DOUBLE PRECISION NULL,
  "fonte" TEXT NOT NULL,
  "nota" TEXT NOT NULL DEFAULT '',
  "chiestoIl" TIMESTAMP(3) NULL,
  "rispostoIl" TIMESTAMP(3) NULL,
  "scrittoDa" TEXT NULL,
  "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aggiornatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE UNIQUE INDEX IF NOT EXISTS "PrezzoProdottoPartner_chiave" ON messaging."PrezzoProdottoPartner" ("codice", "variante", "partnerId", "provincia")`);
await q(`CREATE INDEX IF NOT EXISTS "PrezzoProdottoPartner_codice" ON messaging."PrezzoProdottoPartner" ("codice")`);
await q(`CREATE INDEX IF NOT EXISTS "PrezzoProdottoPartner_partner" ON messaging."PrezzoProdottoPartner" ("partnerId")`);
const n = await p.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM messaging."PrezzoProdottoPartner"`);
console.log('tabella pronta · righe:', n[0].n);
await p.$disconnect();

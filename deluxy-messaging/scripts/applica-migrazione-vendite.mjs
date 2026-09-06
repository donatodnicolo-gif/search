/**
 * VENDITE (06/09/2026, nuova architettura — regola utente): il Customer Service è il custode dello
 * sconto per provincia e delle liste di priorità per area commerciale. Due tabelle nello schema
 * «messaging». Idempotente. Uso: node scripts/applica-migrazione-vendite.mjs
 * (DATABASE_URL dal .env di questa cartella.)
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
await q(`CREATE TABLE IF NOT EXISTS messaging."ScontoProvincia" (
  "provincia" TEXT PRIMARY KEY,
  "conPartner" DOUBLE PRECISION NULL,
  "senzaPartner" DOUBLE PRECISION NULL,
  "nota" TEXT NOT NULL DEFAULT '',
  "modificatoDa" TEXT NULL,
  "aggiornatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
await q(`CREATE TABLE IF NOT EXISTS messaging."ListaPrioritaArea" (
  "id" TEXT PRIMARY KEY,
  "area" TEXT NOT NULL,
  "province" TEXT NOT NULL DEFAULT '[]',
  "mestiere" TEXT NOT NULL,
  "partner" TEXT NOT NULL DEFAULT '[]',
  "origine" TEXT NOT NULL DEFAULT '',
  "importataIl" TIMESTAMP(3) NULL,
  "modificataIl" TIMESTAMP(3) NULL,
  "modificataDa" TEXT NULL,
  "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("area", "mestiere"))`);
console.log('✓ tabelle ScontoProvincia e ListaPrioritaArea (schema messaging)');
await p.$disconnect();

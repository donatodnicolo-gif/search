/**
 * TIPOLOGIA DI VENDITA (06/09/2026 sera, regola utente): colonna `Product.tipologiaVendita`
 * — unico | quantita | mix | preventivo. Vuota = da classificare.
 * Idempotente. Uso: node scripts/applica-migrazione-tipologia-vendita.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const p = new PrismaClient();
await p.$executeRawUnsafe(`ALTER TABLE platform."Product" ADD COLUMN IF NOT EXISTS "tipologiaVendita" TEXT NULL`);
const n = await p.$queryRawUnsafe(`SELECT count(*)::int AS n FROM platform."Product" WHERE "deletedAt" IS NULL`);
console.log('✓ colonna tipologiaVendita · prodotti da classificare:', n[0].n);
await p.$disconnect();

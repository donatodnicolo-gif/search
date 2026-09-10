/**
 * COLONNA «prodottoApp» su platform."Product" (10/09/2026, regola utente): il prodotto che vive
 * solo nella piattaforma consegne e non si espone a Merchandising.
 *   node api/scripts/applica-migrazione-prodotto-app.mjs            (anteprima)
 *   node api/scripts/applica-migrazione-prodotto-app.mjs --applica
 * Solo ADD COLUMN IF NOT EXISTS, default false: le altre app non se ne accorgono.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const APPLICA = process.argv.includes('--applica');
const RADICE = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';
const require = createRequire(RADICE + 'api/package.json');
const { PrismaClient } = require('@prisma/client');
const rigaEnv = fs.readFileSync(RADICE + 'api/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '')); u.searchParams.set('schema', 'platform'); u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });
const prima = await db.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema='platform' AND table_name='Product' AND column_name='prodottoApp'`);
console.log('colonna già presente:', prima.length ? 'sì' : 'no');
if (!APPLICA) { console.log('ANTEPRIMA: nessuna scrittura.'); await db.$disconnect(); process.exit(0); }
await db.$executeRawUnsafe('ALTER TABLE platform."Product" ADD COLUMN IF NOT EXISTS "prodottoApp" BOOLEAN NOT NULL DEFAULT false');
const dopo = await db.$queryRawUnsafe(`SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_schema='platform' AND table_name='Product' AND column_name='prodottoApp'`);
console.log('VERIFICA:', JSON.stringify(dopo));
await db.$disconnect();

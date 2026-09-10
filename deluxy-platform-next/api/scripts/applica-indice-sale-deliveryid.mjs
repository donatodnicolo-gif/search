/**
 * L'INDICE UNICO SU Sale.deliveryId VA TOLTO (trovato il 10/09/2026): lo schema Prisma dal 07/09 dice
 * `@@index([deliveryId])` (regola utente «due prodotti stesso partner → una consegna con più righe»),
 * ma in produzione c'è ancora `Sale_deliveryId_key` UNIQUE. Effetto: la seconda vendita dello stesso
 * ordine per lo stesso partner NON si può agganciare (P2002) — l'accettazione della seconda riga
 * fallirebbe. Trovato agganciando #12895 → #101104.
 *   node api/scripts/applica-indice-sale-deliveryid.mjs            (anteprima)
 *   node api/scripts/applica-indice-sale-deliveryid.mjs --applica  (DROP unico + CREATE non unico)
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
const idx = await db.$queryRawUnsafe(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='platform' AND tablename='Sale' AND indexdef ILIKE '%deliveryId%'`);
console.log('indici oggi:', idx.map((i) => i.indexdef).join(' | '));
if (!APPLICA) { console.log('ANTEPRIMA: nessuna scrittura.'); await db.$disconnect(); process.exit(0); }
await db.$executeRawUnsafe('DROP INDEX IF EXISTS platform."Sale_deliveryId_key"');
await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Sale_deliveryId_idx" ON platform."Sale" ("deliveryId")');
const dopo = await db.$queryRawUnsafe(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='platform' AND tablename='Sale' AND indexdef ILIKE '%deliveryId%'`);
console.log('VERIFICA:', dopo.map((i) => i.indexdef).join(' | '));
await db.$disconnect();

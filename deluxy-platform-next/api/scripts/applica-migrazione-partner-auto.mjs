/**
 * «CONSEGNA PARTNER AUTOMATICO» (06/09/2026, regola utente): la colonna
 * platform."Partner"."autoDeliveredByPartner". Solo ADD COLUMN IF NOT EXISTS,
 * default false: non tocca righe esistenti. Idempotente.
 * Uso: node scripts/applica-migrazione-partner-auto.mjs
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
await prisma.$executeRawUnsafe(`ALTER TABLE platform."Partner" ADD COLUMN IF NOT EXISTS "autoDeliveredByPartner" BOOLEAN NOT NULL DEFAULT false`);
const n = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM platform."Partner" WHERE "autoDeliveredByPartner"`);
console.log('✓ colonna Partner.autoDeliveredByPartner pronta · partner con flag acceso:', n[0].n);
await prisma.$disconnect();

/**
 * ESCLUSO DALLE PROPOSTE (06/09/2026 sera, regola utente): «escludi dalla lista dei partner a cui
 * proporre Artista Locale, Deluxy Flowers, Cakedesignme; spiega la cosa con un flag nella scheda».
 * 1) colonna Partner.esclusoDalleProposte (default false); 2) acceso ai tre partner di ripiego.
 * Idempotente. Uso: node scripts/applica-migrazione-escluso-proposte.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const p = new PrismaClient();
await p.$executeRawUnsafe(`ALTER TABLE platform."Partner" ADD COLUMN IF NOT EXISTS "esclusoDalleProposte" BOOLEAN NOT NULL DEFAULT false`);
const righe = await p.$queryRawUnsafe(`UPDATE platform."Partner" SET "esclusoDalleProposte" = true WHERE NOT deleted AND (insegna ILIKE 'artista locale%' OR insegna ILIKE 'deluxy%flowers%' OR insegna ILIKE 'deluxyflowers%' OR insegna ILIKE 'cake%design%me%' OR insegna ILIKE 'cakedesignme%') RETURNING insegna`);
console.log('✓ colonna esclusoDalleProposte · accesa a:', righe.map((r) => r.insegna).join(', '));
await p.$disconnect();

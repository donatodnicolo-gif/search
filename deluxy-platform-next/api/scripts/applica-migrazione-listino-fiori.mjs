/**
 * LISTINO DEI FIORI (06/09/2026 sera, regola utente): colonna `Partner.listinoFioriCompilatoIl`
 * — vuota = al fioraio si chiede di compilare il listino al primo accesso.
 * Idempotente. Uso: node scripts/applica-migrazione-listino-fiori.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const p = new PrismaClient();
await p.$executeRawUnsafe(`ALTER TABLE platform."Partner" ADD COLUMN IF NOT EXISTS "listinoFioriCompilatoIl" TIMESTAMP(3) NULL`);
const n = await p.$queryRawUnsafe(`SELECT count(*)::int AS n FROM platform."Partner" pa WHERE NOT pa.deleted AND pa.active AND EXISTS (SELECT 1 FROM platform."PartnerMestiere" pm JOIN platform."Mestiere" m ON m.id = pm."mestiereId" WHERE pm."partnerId" = pa.id AND m.nome = 'Fiorista')`);
console.log('✓ colonna listinoFioriCompilatoIl · fioristi attivi a cui verrà chiesto il listino:', n[0].n);
await p.$disconnect();

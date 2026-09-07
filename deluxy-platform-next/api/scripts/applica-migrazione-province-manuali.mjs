/**
 * PROVINCE A MANO oltre alle aree (06/09/2026, regola utente): «consenti però per ogni partner e
 * valet di aggiungere comunque specifiche province oltre alle aree».
 * Colonna `manuale` su PartnerProvince e ValetProvince: le righe scelte a mano restano quando si
 * ricalcolano le province dalle aree. Le righe esistenti nascono tutte manuale=false (sono
 * esattamente quelle delle aree: copertura esatta della semina).
 * Idempotente. Uso: node scripts/applica-migrazione-province-manuali.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const p = new PrismaClient();
await p.$executeRawUnsafe(`ALTER TABLE platform."PartnerProvince" ADD COLUMN IF NOT EXISTS "manuale" BOOLEAN NOT NULL DEFAULT false`);
await p.$executeRawUnsafe(`ALTER TABLE platform."ValetProvince" ADD COLUMN IF NOT EXISTS "manuale" BOOLEAN NOT NULL DEFAULT false`);
// province non coperte da nessuna area del partner/valet → sono «a mano» (oggi nessuna, la semina era esatta)
const a = await p.$executeRawUnsafe(`UPDATE platform."PartnerProvince" pp SET manuale = true WHERE NOT manuale AND NOT EXISTS (SELECT 1 FROM platform."PartnerArea" pa JOIN platform."AreaProvincia" ap ON ap."areaId" = pa."areaId" WHERE pa."partnerId" = pp."partnerId" AND ap."provinceId" = pp."provinceId") AND EXISTS (SELECT 1 FROM platform."PartnerArea" WHERE "partnerId" = pp."partnerId")`);
const b = await p.$executeRawUnsafe(`UPDATE platform."ValetProvince" vp SET manuale = true WHERE NOT manuale AND NOT EXISTS (SELECT 1 FROM platform."ValetArea" va JOIN platform."AreaProvincia" ap ON ap."areaId" = va."areaId" WHERE va."valetId" = vp."valetId" AND ap."provinceId" = vp."provinceId") AND EXISTS (SELECT 1 FROM platform."ValetArea" WHERE "valetId" = vp."valetId")`);
console.log('✓ colonna manuale · righe fuori dalle aree marcate a mano: partner', a, '· valet', b);
await p.$disconnect();

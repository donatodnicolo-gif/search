/** ⭐ 07/09/2026 (regola utente «nascondi da consegne»): due colonne su Delivery per togliere
 *  una NON CONSEGNATA dall'elenco operativo lasciandola in Storico. Nullable: nessuna consegna
 *  cambia. Idempotente. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/api/package.json');
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const p = new PrismaClient();
await p.$executeRawUnsafe(`ALTER TABLE platform."Delivery" ADD COLUMN IF NOT EXISTS "nonConsegnataChiusaIl" TIMESTAMP(3)`);
await p.$executeRawUnsafe(`ALTER TABLE platform."Delivery" ADD COLUMN IF NOT EXISTS "nonConsegnataChiusaDa" TEXT`);
const n = await p.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM platform."Delivery" d WHERE d.status = 'not_delivered' AND d."deletedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM platform."Delivery" f WHERE f."parentDeliveryId" = d.id)`);
console.log(`colonne pronte · non consegnate senza riconsegna oggi in elenco: ${n[0].n}`);
await p.$disconnect();

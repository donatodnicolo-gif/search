/** ⭐ 07/09/2026 — colonna `Sale.quantity` (schema platform): quanti pezzi ha la vendita.
 *  Serve ai generici a quantità («50 rose rosse»). Default 1, nessuna vendita cambia. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/api/package.json');
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const p = new PrismaClient();
await p.$executeRawUnsafe(`ALTER TABLE platform."Sale" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1`);
const n = await p.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM platform."Sale"`);
console.log('colonna pronta · vendite:', n[0].n);
await p.$disconnect();

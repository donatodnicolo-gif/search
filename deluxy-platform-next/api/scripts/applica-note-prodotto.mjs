/** ⭐ 07/09/2026 — colonne `note` su Product e ProductVariant (schema platform): la specifica
 *  che arriva da Merchandising e che il fioraio deve vedere. Nullable, idempotente. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/api/package.json');
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const p = new PrismaClient();
await p.$executeRawUnsafe(`ALTER TABLE platform."Product" ADD COLUMN IF NOT EXISTS "note" TEXT`);
await p.$executeRawUnsafe(`ALTER TABLE platform."ProductVariant" ADD COLUMN IF NOT EXISTS "note" TEXT`);
const a = await p.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM platform."Product" WHERE "note" IS NOT NULL`);
const b = await p.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM platform."ProductVariant" WHERE "note" IS NOT NULL`);
console.log(`colonne pronte · note: ${a[0].n} prodotti, ${b[0].n} varianti`);
await p.$disconnect();

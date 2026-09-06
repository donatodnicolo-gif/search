/**
 * RICONCILIAZIONE PER VARIANTE (06/09/2026, regola utente): «solo se variante è la stessa, la
 * riconciliazione approvata, provincia inclusa e partner aperto».
 * 1) colonna productVariantId (FK a ProductVariant, SET NULL) su ProductReconciliation;
 * 2) chiave unica da (prodotto, provincia) a (prodotto, provincia, variante);
 * 3) alle proposte esistenti si scrive la variante quando le vendite da cui sono nate ne hanno UNA sola
 *    (misurato: 101 proposte, 0 accettate, 1 sola con più varianti → resta senza e il prossimo giro la sdoppia).
 * Idempotente. Uso: node scripts/applica-migrazione-riconciliazione-variante.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const p = new PrismaClient();
const q = (s, ...a) => p.$executeRawUnsafe(s, ...a);
const r = (s, ...a) => p.$queryRawUnsafe(s, ...a);

await q(`ALTER TABLE platform."ProductReconciliation" ADD COLUMN IF NOT EXISTS "productVariantId" TEXT NULL`);
const fk = await r(`SELECT 1 FROM pg_constraint WHERE conname = 'ProductReconciliation_productVariantId_fkey'`);
if (!fk.length) await q(`ALTER TABLE platform."ProductReconciliation" ADD CONSTRAINT "ProductReconciliation_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES platform."ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
await q(`DROP INDEX IF EXISTS platform."ProductReconciliation_productId_provinceId_key"`);
await q(`CREATE UNIQUE INDEX IF NOT EXISTS "ProductReconciliation_productId_provinceId_productVariantId_key" ON platform."ProductReconciliation" ("productId", "provinceId", "productVariantId")`);
console.log('✓ schema: colonna, FK, chiave unica su (prodotto, provincia, variante)');

// 3) backfill delle proposte con UNA sola variante nelle vendite di origine
const ric = await r(`SELECT id, "productId", "provinceId", "partnerId", status FROM platform."ProductReconciliation" WHERE "productVariantId" IS NULL`);
let scritte = 0, ambigue = 0, senza = 0;
for (const x of ric) {
  const v = await r(`SELECT "productVariantId", count(*)::int AS n FROM platform."Sale" WHERE "productId" = $1 AND "provinceId" = $2 AND "partnerId" = $3 AND status = 'accettata' GROUP BY "productVariantId"`, x.productId, x.provinceId, x.partnerId);
  const conVariante = v.filter((y) => y.productVariantId);
  if (conVariante.length === 1 && v.length === 1) { await q(`UPDATE platform."ProductReconciliation" SET "productVariantId" = $1 WHERE id = $2`, conVariante[0].productVariantId, x.id); scritte++; }
  else if (v.length > 1) ambigue++;
  else senza++;
}
console.log(`✓ proposte: variante scritta ${scritte} · più varianti (lasciate senza, si sdoppiano al prossimo giro) ${ambigue} · senza variante ${senza}`);
await p.$disconnect();

/** ⭐ 07/09/2026 — importa da Merchandising le NOTE DI SPECIFICA (prodotto e varianti) usando la
 *  stessa strada dell'app (`GET /api/v1/prodotti` con la chiave configurata). PROVA di default. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/api/package.json');
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const SCRIVI = process.argv.includes('--scrivi');
const p = new PrismaClient();
const cfg = Object.fromEntries((await p.appSetting.findMany({ where: { key: { in: ['merchandisingUrl', 'merchandisingApiKey'] } } })).map((r) => [r.key, r.value]));
const url = (cfg.merchandisingUrl ?? '').replace(/\/+$/, '');
const chiave = cfg.merchandisingApiKey ?? '';
if (!url || !chiave) { console.error('Merchandising non configurato.'); process.exit(1); }
const noteP = new Map(), noteV = new Map();
for (let pagina = 1; ; pagina++) {
  const res = await fetch(`${url}/api/v1/prodotti?page=${pagina}&limit=200`, { headers: { 'x-api-key': chiave } });
  if (!res.ok) { console.error(`HTTP ${res.status} alla pagina ${pagina}`); break; }
  const body = await res.json();
  for (const x of body.prodotti ?? []) {
    const c = String(x.codice ?? '').trim().toUpperCase();
    if (c && x.note) noteP.set(c, x.note);
    for (const v of x.varianti ?? []) { const s = String(v.sku ?? '').trim().toUpperCase(); if (s && v.note) noteV.set(s, v.note); }
  }
  if (!(body.prodotti ?? []).length || pagina >= (body.pagine ?? 1)) break;
}
const prodotti = await p.product.findMany({ where: { deletedAt: null, NOT: { sku: null } }, select: { id: true, sku: true, note: true } });
const varianti = await p.productVariant.findMany({ where: { NOT: { sku: null } }, select: { id: true, sku: true, note: true } });
const dp = prodotti.filter((x) => { const n = noteP.get(x.sku.trim().toUpperCase()); return n && n !== x.note; });
const dv = varianti.filter((x) => { const n = noteV.get(x.sku.trim().toUpperCase()); return n && n !== x.note; });
console.table([
  { voce: 'note in Merchandising · prodotti', n: noteP.size },
  { voce: 'note in Merchandising · varianti', n: noteV.size },
  { voce: 'da scrivere qui · prodotti', n: dp.length },
  { voce: 'da scrivere qui · varianti', n: dv.length },
]);
if (SCRIVI) {
  for (const x of dp) await p.product.update({ where: { id: x.id }, data: { note: noteP.get(x.sku.trim().toUpperCase()) } });
  for (const x of dv) await p.productVariant.update({ where: { id: x.id }, data: { note: noteV.get(x.sku.trim().toUpperCase()) } });
  console.log(`SCRITTE: ${dp.length} prodotti, ${dv.length} varianti`);
  console.log('esempi:', dp.slice(0, 3).map((x) => `${x.sku}: ${noteP.get(x.sku.trim().toUpperCase())}`).join(' · '));
} else console.log('PROVA: nulla scritto. `--scrivi` per importare.');
await p.$disconnect();

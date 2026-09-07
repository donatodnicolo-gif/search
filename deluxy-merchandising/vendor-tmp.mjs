import fs from 'node:fs';
for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();
const g = await p.prodotto.groupBy({ by: ['vendorShopify'], _count: { _all: true } });
const cerca = ['clivati', 'martesana', 'rizzi', 'stefanelli'];
console.log('--- vendor che combaciano ---');
for (const r of g) {
  const v = (r.vendorShopify || '').toLowerCase();
  if (cerca.some(c => v.includes(c))) console.log(`${String(r._count._all).padStart(4)}  ${r.vendorShopify}`);
}
await p.$disconnect();

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
const r = await p.prodotto.findMany({
  where: { handleShopify: { in: ['degustazione-pugliese', 'aperitivo-salato-stefanelli-copy'] } },
  select: { handleShopify: true, shopifyId: true, nome: true },
});
console.log(JSON.stringify(r, null, 2));
await p.$disconnect();

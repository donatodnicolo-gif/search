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
const VEND = ['Enrico Rizzi Milano', 'Adolfo Stefanelli', 'Clivati 1969', 'MARTESANA MILANO'];
const tutti = await p.prodotto.findMany({
  where: { vendorShopify: { in: VEND } },
  select: { nome: true, handleShopify: true, shopifyId: true, vendorShopify: true, statoShopify: true,
            nonFisicoShopify: true, pezzoUnicoShopify: true, partnerIdShopify: true, partnerIndirizzoShopify: true },
});
const conta = {};
for (const t of tutti) {
  const k = `${t.statoShopify || 'null'} / ${t.shopifyId ? 'suShopify' : 'soloLocale'}`;
  conta[k] = (conta[k] || 0) + 1;
}
console.log('stato / presenza su Shopify:', JSON.stringify(conta, null, 2));
const dubbi = tutti.filter(t => t.shopifyId && t.statoShopify !== 'ACTIVE' && t.statoShopify !== 'ARCHIVED');
console.log('\nsu Shopify ma non ACTIVE/ARCHIVED:', dubbi.length);
for (const d of dubbi.slice(0, 15)) console.log(`  ${d.statoShopify} ${d.handleShopify} — ${d.nome} (unico:${d.pezzoUnicoShopify} partner:${d.partnerIdShopify})`);
const draftIncompleti = tutti.filter(t => t.shopifyId && t.statoShopify === 'DRAFT' && (t.pezzoUnicoShopify === null || !t.partnerIdShopify));
console.log('\nDRAFT su Shopify con campi mancanti:', draftIncompleti.length);
await p.$disconnect();

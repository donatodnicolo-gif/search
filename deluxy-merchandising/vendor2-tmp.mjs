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
const righe = await p.prodotto.findMany({
  where: { vendorShopify: { in: VEND }, statoShopify: 'ACTIVE' },
  select: { nome: true, handleShopify: true, shopifyId: true, vendorShopify: true,
            zoneConsegna: true, nonFisicoShopify: true, pezzoUnicoShopify: true,
            partnerIdShopify: true, partnerIndirizzoShopify: true },
});
const per = {};
for (const v of VEND) per[v] = { attivi: 0, mancaZone: 0, mancaNonFisico: 0, mancaUnico: 0, mancaPartnerId: 0, mancaIndirizzo: 0, tuttoOk: 0, unicoTrue: 0, unicoFalse: 0, partnerIds: {}, indirizzi: {} };
for (const r of righe) {
  const s = per[r.vendorShopify];
  s.attivi++;
  if (!r.zoneConsegna) s.mancaZone++;
  if (r.nonFisicoShopify === null) s.mancaNonFisico++;
  if (r.pezzoUnicoShopify === null) s.mancaUnico++; else if (r.pezzoUnicoShopify) s.unicoTrue++; else s.unicoFalse++;
  if (!r.partnerIdShopify) s.mancaPartnerId++; else s.partnerIds[r.partnerIdShopify] = (s.partnerIds[r.partnerIdShopify] || 0) + 1;
  if (!r.partnerIndirizzoShopify) s.mancaIndirizzo++; else s.indirizzi[r.partnerIndirizzoShopify] = (s.indirizzi[r.partnerIndirizzoShopify] || 0) + 1;
  if (r.zoneConsegna && r.nonFisicoShopify !== null && r.pezzoUnicoShopify !== null && r.partnerIdShopify && r.partnerIndirizzoShopify) s.tuttoOk++;
}
for (const v of VEND) {
  const s = per[v];
  console.log(`\n=== ${v} — ${s.attivi} attivi, completi ${s.tuttoOk} ===`);
  console.log(`  manca zone ${s.mancaZone} | manca not_physical ${s.mancaNonFisico} | manca is_unique ${s.mancaUnico} (true ${s.unicoTrue}, false ${s.unicoFalse}) | manca partner_id ${s.mancaPartnerId} | manca partner_address ${s.mancaIndirizzo}`);
  console.log(`  partner_id gia' presenti: ${JSON.stringify(s.partnerIds)}`);
  console.log(`  partner_address gia' presenti: ${JSON.stringify(s.indirizzi)}`);
}
fs.writeFileSync('vendor-righe-tmp.json', JSON.stringify(righe, null, 2));
await p.$disconnect();

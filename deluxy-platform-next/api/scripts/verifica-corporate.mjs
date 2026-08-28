import fs from 'node:fs';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=5`;
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();

// Le ultime coppie Casati 14 (corporate) ⇄ MALI'A (vendita), per legacyCorrespondDeliveryId.
const righe = await p.$queryRawUnsafe(`
  SELECT
    c.code AS corp_code, c."legacyId" AS corp_legacy, c.date AS corp_date,
    sc.name AS corp_serv, sc."pricingModel" AS corp_model, pc.insegna AS corp_partner,
    c.price AS corp_price, c.status AS corp_status,
    c."pickupAddress" AS corp_pickup, c."recipientAddress" AS corp_dest,
    c."recipientFirstName" AS corp_dest_nome, c."recipientLastName" AS corp_dest_cognome,
    c."deliveryTimeFrom" AS corp_da, c."deliveryTimeTo" AS corp_a,
    c."parentDeliveryId" AS corp_parent, c."valetId" AS corp_valet,
    d.code AS ven_code, d."legacyId" AS ven_legacy, d.date AS ven_date,
    sv.name AS ven_serv, sv."pricingModel" AS ven_model, pv.insegna AS ven_partner,
    d.price AS ven_price, d.status AS ven_status,
    d."pickupAddress" AS ven_pickup, d."recipientAddress" AS ven_dest,
    d."recipientFirstName" AS ven_dest_nome, d."recipientLastName" AS ven_dest_cognome,
    d."deliveryTimeFrom" AS ven_da, d."deliveryTimeTo" AS ven_a,
    d."parentDeliveryId" AS ven_parent, d."valetId" AS ven_valet, d.id AS ven_id, c.id AS corp_id
  FROM platform."Delivery" d
  JOIN platform."ServiceType" sv ON sv.id = d."serviceTypeId" AND sv."pricingModel"='VENDITA'
  JOIN platform."Delivery" c ON c."legacyId" = d."legacyCorrespondDeliveryId" AND c."deletedAt" IS NULL
  JOIN platform."ServiceType" sc ON sc.id = c."serviceTypeId" AND sc."pricingModel"='CORPORATE'
  LEFT JOIN platform."Partner" pc ON pc.id = c."partnerId"
  LEFT JOIN platform."Partner" pv ON pv.id = d."partnerId"
  WHERE d."deletedAt" IS NULL AND pc.insegna = 'Casati 14' AND pv.insegna = 'MALI''A'
  ORDER BY c.date DESC
  LIMIT 4`);

const ora = (v) => (v == null ? '—' : String(v));
for (const r of righe) {
  console.log('\n' + '═'.repeat(78));
  console.log(`COPPIA — data ${new Date(r.corp_date).toISOString().slice(0, 10)}`);
  console.log('═'.repeat(78));
  const tab = (et, a, b) => console.log(('  ' + et).padEnd(24) + String(a).padEnd(28) + String(b));
  tab('', `RIGA A  #${r.corp_code}`, `RIGA B  #${r.ven_code}`);
  tab('legacy id', r.corp_legacy, r.ven_legacy);
  tab('partner', r.corp_partner, r.ven_partner);
  tab('servizio', r.corp_serv, r.ven_serv);
  tab('modello prezzo', r.corp_model, r.ven_model);
  tab('prezzo', r.corp_price, r.ven_price);
  tab('stato', r.corp_status, r.ven_status);
  tab('ritiro', (r.corp_pickup ?? '—').slice(0, 26), (r.ven_pickup ?? '—').slice(0, 26));
  tab('consegna', (r.corp_dest ?? '—').slice(0, 26), (r.ven_dest ?? '—').slice(0, 26));
  tab('destinatario', `${r.corp_dest_nome ?? ''} ${r.corp_dest_cognome ?? ''}`.trim() || '—',
                      `${r.ven_dest_nome ?? ''} ${r.ven_dest_cognome ?? ''}`.trim() || '—');
  tab('fascia', `${ora(r.corp_da)}–${ora(r.corp_a)}`, `${ora(r.ven_da)}–${ora(r.ven_a)}`);
  tab('parentDeliveryId', r.corp_parent ?? '—', r.ven_parent ?? '—');
  tab('valet', r.corp_valet ?? '—', r.ven_valet ?? '—');

  for (const [et, id] of [['A', r.corp_id], ['B', r.ven_id]]) {
    const prod = await p.deliveryProduct.findMany({
      where: { deliveryId: id },
      select: { quantity: true, price: true, product: { select: { name: true, type: true, partner: { select: { insegna: true } } } } },
    });
    console.log(`  prodotti riga ${et}: ` + (prod.length
      ? prod.map((x) => `${x.quantity}× ${x.product?.name ?? '?'} @${x.price} (di ${x.product?.partner?.insegna ?? '—'}, ${x.product?.type})`).join(' | ')
      : '(nessuno)'));
  }
}
await p.$disconnect();

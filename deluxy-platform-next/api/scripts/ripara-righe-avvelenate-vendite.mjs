/**
 * RIPARA le righe prodotto «avvelenate» delle vendite pendenti (decisione
 * utente 02/09: «correggi», dopo la tabella delle 96).
 *
 * Il veleno (import legacy): su queste righe `quantity` è il numero di FIORI
 * o il prezzo è quello di CATALOGO di un altro taglio — righe × quantità dà
 * 135.000 € su una vendita da 700 (#63200), o zero su una da 52. La verità è
 * `productValue`: su TUTTE la quota legacy = fee% × productValue al centesimo.
 *
 * La cura: il prezzo di riga diventa productValue ÷ quantità (la #63200 torna
 * 7 € × 100 rose = 700); con più righe si ripartisce in proporzione ai valori
 * attuali (se sommano zero: tutto sulla prima riga). Poi si SVUOTA anche la
 * quota scritta: ora che le righe dicono il vero, vale il canone (fee% ×
 * righe = la stessa quota, ma viva invece che congelata).
 *
 * Selezione identica alla tabella: vendite vive, price > 0 coerente con
 * fee% × productValue (±0,02), righe divergenti (±0,02), non fatturate, senza
 * righe di fattura o stipendio. Log su ogni consegna; prova a vuoto di
 * default, con --applica scrive (backup json completo prima).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();

const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;
const eur = (n) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const cons = await prisma.delivery.findMany({
  where: {
    deletedAt: null, price: { gt: 0 }, invoiced: false,
    invoiceLines: { none: {} }, salaryLines: { none: {} },
    serviceType: { pricingModel: 'VENDITA' },
  },
  select: {
    id: true, code: true, price: true, productValue: true, partnerId: true, serviceTypeId: true,
    partner: { select: { insegna: true } },
    products: { where: { deletedAt: null }, select: { id: true, price: true, quantity: true, productName: true,
      productVariant: { select: { price: true, publicPrice: true } },
      product: { select: { name: true, price: true, publicPrice: true } } } },
  },
  orderBy: { code: 'asc' },
});
const listini = new Map();
for (const l of await prisma.partnerService.findMany({ select: { partnerId: true, serviceTypeId: true, price: true } }))
  listini.set(`${l.partnerId}|${l.serviceTypeId}`, l.price);

const unitAttuale = (p) => p.price ?? p.productVariant?.price ?? p.productVariant?.publicPrice ?? p.product?.price ?? p.product?.publicPrice ?? 0;

const backup = [];
let riparate = 0, residui = 0;
for (const c of cons) {
  const fee = listini.get(`${c.partnerId}|${c.serviceTypeId}`);
  const pv = c.productValue ?? 0;
  if (fee == null || pv <= 0 || !c.products.length) continue;
  const somma = r2(c.products.reduce((s, p) => s + unitAttuale(p) * (p.quantity ?? 1), 0));
  if (Math.abs(c.price - r2((pv * fee) / 100)) > 0.02) continue; // quota non coerente con pv: non è di questa famiglia
  if (Math.abs(somma - pv) <= 0.02) continue; // righe già vere

  // Il piano riga per riga: una riga sola -> pv ÷ quantità; più righe -> in
  // proporzione ai valori attuali (se sommano zero, tutto sulla prima).
  const piani = [];
  if (c.products.length === 1) {
    const p = c.products[0];
    piani.push({ p, nuovo: r4(pv / (p.quantity ?? 1)) });
  } else if (somma > 0) {
    for (const p of c.products) piani.push({ p, nuovo: r4((unitAttuale(p) * (pv / somma))) });
  } else {
    c.products.forEach((p, i) => piani.push({ p, nuovo: i === 0 ? r4(pv / (p.quantity ?? 1)) : 0 }));
  }
  const sommaNuova = r2(piani.reduce((s, x) => s + x.nuovo * (x.p.quantity ?? 1), 0));
  const scarto = r2(Math.abs(sommaNuova - pv));
  if (scarto > 0.02) { residui++; console.log(`  ⚠️ #${c.code}: residuo di arrotondamento ${scarto} — NON toccata, da guardare a mano`); continue; }

  riparate++;
  console.log(`  #${c.code} ${c.partner.insegna.slice(0, 22).padEnd(23)} righe ${eur(somma)} → ${eur(sommaNuova)} (= verità ${eur(pv)}) · ${piani.map(x => `${eur(x.nuovo)}×${x.p.quantity ?? 1}`).join(' + ')} · quota ${eur(c.price)} → vuota (canone ${fee}%)`);
  if (!APPLICA) continue;

  backup.push({ id: c.id, code: c.code, price: c.price, productValue: pv,
    righe: c.products.map(p => ({ id: p.id, price: p.price, quantity: p.quantity })) });
  for (const x of piani) {
    await prisma.deliveryProduct.update({ where: { id: x.p.id }, data: { price: x.nuovo } });
  }
  await prisma.delivery.update({ where: { id: c.id }, data: {
    price: null,
    logs: { create: [{ type: 'product_fix', message: `Righe prodotto riparate: sommavano ${eur(somma)} (quantità/prezzi di catalogo del legacy), il venduto vero è ${eur(pv)} (productValue, con cui la quota ${eur(c.price)} = ${fee}% combacia al centesimo). Prezzo di riga → verità ÷ quantità; quota svuotata: ora vale il canone (${fee}% × righe). Riparazione delle 96 righe avvelenate (utente, 02/09).` }] },
  } });
}
console.log(`\nriparate ${riparate} · residui di arrotondamento non toccati ${residui}`);
if (APPLICA) {
  const file = `C:/Users/nicol/AppData/Local/Temp/claude/backup-righe-avvelenate-${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify(backup, null, 1));
  console.log(`✅ applicato. Backup: ${file}`);
} else {
  console.log('(prova a vuoto: rilanciare con --applica)');
}
await prisma.$disconnect();

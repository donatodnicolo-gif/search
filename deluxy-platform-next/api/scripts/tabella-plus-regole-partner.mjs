import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '')); u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();
const q2 = (n) => Math.round(n * 100) / 100;
const eur = (n) => (n == null ? '—' : q2(n).toFixed(2).replace('.', ','));
const NB = ['cancelled', 'invalidated', 'not_accepted'];
const backup = JSON.parse(fs.readFileSync('scripts/backup-plus-in-regole-2026-09-04.json', 'utf8'));
const plusOriginale = new Map(backup.map((b) => [b.id, b.additionalPrice]));
function vp(righe, productValue) { const s = (righe ?? []).reduce((a, p) => a + (p.price ?? p.productVariant?.price ?? p.productVariant?.publicPrice ?? p.product?.price ?? p.product?.publicPrice ?? 0) * (p.quantity ?? 1), 0); return s === 0 && (productValue ?? 0) > 0 ? productValue : s; }
function finale(d, listino, regola) {
  if (regola && regola.toBill === false) return null;
  const extra = (d.additionalPrice ?? 0) + (d.ruleAdjustment ?? (regola?.partnerBillingAdjustment ?? 0));
  const mn = (n) => Math.max(0, q2(n));
  if ((d.price ?? 0) > 0) return mn(d.price + extra);
  const m = d.serviceType?.pricingModel ?? ''; const km = d.distanceKm ?? 0;
  const suppl = () => { if (!listino) return 0; if (d.extraOutOfCity) return km * (listino.extraOutOfCityPrice ?? 0); const oltre = d.extraKm > 0 ? d.extraKm : Math.max(0, km - (listino.includedKm ?? 0)); return oltre * (listino.extraKmPrice ?? 0); };
  if (!listino && m !== 'CORPORATE') return null;
  switch (m) {
    case 'PREZZO_FISSO': return d.extraOutOfCity ? mn(suppl() + extra) : mn((listino?.price ?? 0) + suppl() + extra);
    case 'A_ORA': return mn((listino?.price ?? 0) * Math.max(d.hours ?? 0, d.serviceType?.minHours ?? 1) + extra);
    case 'MAGAZZINO': return mn((listino?.price ?? 0) + (listino?.pricePerItem ?? 0) * (d.products ?? []).reduce((s, p) => s + (p.quantity ?? 1), 0) + extra);
    case 'VENDITA': return mn((vp(d.products, d.productValue) * (listino?.price ?? 0)) / 100 + extra);
    case 'CORPORATE': return (d.products ?? []).length ? mn(vp(d.products, d.productValue) + extra) : null;
    default: return null;
  }
}
const DAL = new Date('2026-07-01T00:00:00Z');
const partners = await prisma.partner.findMany({ where: { active: true, OR: [{ insegna: { contains: 'chanel', mode: 'insensitive' } }, { insegna: { contains: 'armani', mode: 'insensitive' } }, { insegna: { in: ['Brioni', 'Bonpoint', 'Basara Tortona'] } }] }, select: { id: true, insegna: true, services: { select: { serviceTypeId: true, price: true, includedKm: true, extraKmPrice: true, extraOutOfCityPrice: true, pricePerItem: true } } }, orderBy: { insegna: 'asc' } });
const riepilogo = [];
for (const p of partners) {
  const listini = new Map(p.services.map((s) => [s.serviceTypeId, s]));
  const cons = await prisma.delivery.findMany({ where: { partnerId: p.id, deletedAt: null, date: { gte: DAL }, deliveryRuleId: { not: null } }, select: { id: true, code: true, date: true, status: true, serviceTypeId: true, price: true, additionalPrice: true, ruleAdjustment: true, hours: true, distanceKm: true, extraKm: true, extraOutOfCity: true, productValue: true, billable: true, invoiced: true, serviceType: { select: { pricingModel: true, minHours: true } }, deliveryRule: { select: { name: true, partnerBillingAdjustment: true, toBill: true } }, products: { where: { deletedAt: null }, select: { quantity: true, price: true, productVariant: { select: { price: true, publicPrice: true } }, product: { select: { price: true, publicPrice: true } } } }, invoiceLines: { select: { amount: true, invoice: { select: { number: true, status: true } } } } }, orderBy: { date: 'asc' } });
  const armani = /armani fiori/i.test(p.insegna);
  const righe = cons.filter((d) => (plusOriginale.get(d.id) ?? 0) !== 0 || (armani && d.date >= new Date('2026-08-01T00:00:00Z')));
  let tot = 0, aperte = 0;
  const out = [];
  for (const d of righe) {
    const l = listini.get(d.serviceTypeId) ?? null;
    const f = finale(d, l, d.deliveryRule);
    const esclusa = NB.includes(d.status) || !d.billable;
    const inv = d.invoiceLines[0];
    const stato = inv ? `${inv.invoice.number} (${inv.invoice.status === 'DRAFT' ? 'bozza, riga ' + eur(inv.amount) : inv.invoice.status.toLowerCase()})` : esclusa ? 'esclusa' : d.invoiced ? 'fatturata (legacy)' : 'da fatturare';
    if (!esclusa && !inv && !d.invoiced && f != null) { tot += f; aperte++; }
    const regole = d.deliveryRule?.toBill === false ? 'non fatt.' : eur(d.ruleAdjustment ?? (d.deliveryRule.partnerBillingAdjustment ?? 0));
    const cambiata = (plusOriginale.get(d.id) ?? 0) !== 0 ? '●' : '';
    out.push(`| ${d.date.toISOString().slice(5, 10).split('-').reverse().join('/')} | ${d.code} | ${eur(d.price)} | ${d.additionalPrice ? eur(d.additionalPrice) : '—'} | ${regole} | ${f == null ? '—' : eur(f)} | ${stato} ${cambiata} |`);
  }
  riepilogo.push({ insegna: p.insegna, conRegola: cons.length, mostrate: righe.length, aperte, tot });
  if (!out.length) continue;
  console.log(`\n### ${p.insegna} — ${righe.length} righe (${cons.length} con regola dal 01/07; ● = plus era copia della regola, ora spostato in Regole)\n`);
  console.log('| Data | # | Prezzo | Plus/minus manuale | Regole | Fatturazione finale | Fattura |');
  console.log('|---|---|---:|---:|---:|---:|---|');
  for (const r of out) console.log(r);
}
console.log('\n### Riepilogo\n');
console.log('| Partner | Con regola dal 01/07 | Righe mostrate | Da fatturare (righe) | Da fatturare (€) |');
console.log('|---|---:|---:|---:|---:|');
for (const r of riepilogo) console.log(`| ${r.insegna} | ${r.conRegola} | ${r.mostrate} | ${r.aperte} | ${eur(r.tot)} |`);
await prisma.$disconnect();

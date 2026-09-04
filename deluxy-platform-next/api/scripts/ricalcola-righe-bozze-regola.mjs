/**
 * RICALCOLO DELLE RIGHE DELLE BOZZE DI FATTURA dopo la regola del 04/09/2026
 * («il plus/minus recepisce la regola carnet, non si somma a lei»).
 *
 * Le righe di una bozza (Invoice DRAFT) portano l'importo calcolato al momento
 * della generazione, con la formula vecchia (plus + regola sommati). Questo
 * script rifà il conto con la formula nuova — la stessa di prezzoConsegna —
 * e mostra le differenze. Con --applica aggiorna InvoiceLine.amount e i
 * totali della fattura (netAmount, totalAmount). ⚠️ NON tocca FINANCE: una
 * bozza già mandata (financeRef) va riallineata di là, e lo dice.
 *
 * Uso: node scripts/ricalcola-righe-bozze-regola.mjs [--partner armani] [--applica]
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();
const APPLICA = process.argv.includes('--applica');
const pi = process.argv.indexOf('--partner');
const PARTNER = pi > 0 ? process.argv[pi + 1] : null;
const IVA = 22;
const q2 = (n) => Math.round(n * 100) / 100;
const conIva = (n) => q2(n * (1 + IVA / 100));
const eur = (n) => (n == null ? '—' : q2(n).toFixed(2).replace('.', ',') + ' €');

function valoreProdotti(righe, productValue) {
  const somma = (righe ?? []).reduce((s, p) => s + (p.price ?? p.productVariant?.price ?? p.productVariant?.publicPrice ?? p.product?.price ?? p.product?.publicPrice ?? 0) * (p.quantity ?? 1), 0);
  if (somma === 0 && (productValue ?? 0) > 0) return productValue;
  return somma;
}
/** Replica di prezzoConsegna (invoices.module.ts) con la regola del 04/09. */
function prezzoConsegna(d, listino, regola) {
  if (regola && regola.toBill === false) return null;
  const extra = regola
    ? ((d.additionalPrice ?? 0) !== 0 ? d.additionalPrice : (regola.partnerBillingAdjustment ?? 0))
    : (d.additionalPrice ?? 0);
  const maiNeg = (n) => Math.max(0, q2(n));
  const vp = valoreProdotti(d.products, d.productValue);
  if ((d.price ?? 0) > 0) return maiNeg(d.price + extra);
  const modello = d.serviceType?.pricingModel ?? '';
  const km = d.distanceKm ?? 0;
  const suppl = () => {
    if (!listino) return 0;
    if (d.extraOutOfCity) return km * (listino.extraOutOfCityPrice ?? 0);
    const inclusi = listino.includedKm ?? 0;
    const oltre = d.extraKm && d.extraKm > 0 ? d.extraKm : Math.max(0, km - inclusi);
    return oltre * (listino.extraKmPrice ?? 0);
  };
  if (!listino && modello !== 'CORPORATE') return null;
  switch (modello) {
    case 'PREZZO_FISSO': return d.extraOutOfCity ? maiNeg(suppl() + extra) : maiNeg((listino?.price ?? 0) + suppl() + extra);
    case 'A_ORA': return maiNeg((listino?.price ?? 0) * Math.max(d.hours ?? 0, d.serviceType?.minHours ?? 1) + extra);
    case 'MAGAZZINO': return maiNeg((listino?.price ?? 0) + (listino?.pricePerItem ?? 0) * (d.products ?? []).reduce((s, p) => s + (p.quantity ?? 1), 0) + extra);
    case 'VENDITA': return maiNeg((vp * (listino?.price ?? 0)) / 100 + extra);
    case 'CORPORATE': return (d.products ?? []).length ? maiNeg(vp + extra) : null;
    default: return null;
  }
}

const bozze = await prisma.invoice.findMany({
  where: { status: 'DRAFT', ...(PARTNER ? { partner: { insegna: { contains: PARTNER, mode: 'insensitive' } } } : {}) },
  select: { id: true, number: true, netAmount: true, totalAmount: true, financeRef: true, financeSentAt: true, periodStart: true, periodEnd: true,
    partner: { select: { id: true, insegna: true, services: { select: { serviceTypeId: true, price: true, includedKm: true, extraKmPrice: true, extraOutOfCityPrice: true, pricePerItem: true } } } },
    lines: { select: { id: true, amount: true, deliveryId: true,
      delivery: { select: { code: true, serviceTypeId: true, price: true, additionalPrice: true, hours: true, distanceKm: true, extraKm: true, extraOutOfCity: true, productValue: true,
        serviceType: { select: { pricingModel: true, minHours: true } },
        deliveryRule: { select: { name: true, partnerBillingAdjustment: true, toBill: true } },
        products: { where: { deletedAt: null }, select: { quantity: true, price: true, productVariant: { select: { price: true, publicPrice: true } }, product: { select: { price: true, publicPrice: true } } } } } } } },
  },
  orderBy: { number: 'asc' },
});
console.log(`${APPLICA ? '✍️ APPLICO' : '👀 ANTEPRIMA'} — bozze DRAFT esaminate: ${bozze.length}\n`);
let bozzeToccate = 0, righeToccate = 0, deltaTot = 0;
for (const b of bozze) {
  const listini = new Map(b.partner.services.map((s) => [s.serviceTypeId, s]));
  const cambi = [];
  for (const l of b.lines) {
    const d = l.delivery;
    if (!d || !d.deliveryRule) continue; // senza regola la formula non cambia
    const nuovo = prezzoConsegna(d, listini.get(d.serviceTypeId) ?? null, d.deliveryRule);
    if (nuovo == null) continue;
    if (Math.abs(nuovo - l.amount) >= 0.005) cambi.push({ l, d, nuovo });
  }
  if (!cambi.length) continue;
  bozzeToccate++;
  const delta = q2(cambi.reduce((s, c) => s + (c.nuovo - c.l.amount), 0));
  deltaTot += delta; righeToccate += cambi.length;
  const nuovoNetto = q2(b.netAmount + delta);
  console.log(`## ${b.number ?? b.id} · ${b.partner.insegna} · ${b.periodStart.toISOString().slice(0, 10)} → ${b.periodEnd.toISOString().slice(0, 10)} · ${cambi.length} righe · imponibile ${eur(b.netAmount)} → ${eur(nuovoNetto)} (${delta >= 0 ? '+' : ''}${eur(delta)})${b.financeRef ? ` ⚠️ già in FINANCE (${b.financeRef}): da riallineare di là` : ''}`);
  for (const c of cambi) console.log(`   #${c.d.code}: ${eur(c.l.amount)} → ${eur(c.nuovo)}  (prezzo ${eur(c.d.price)}, plus ${c.d.additionalPrice ?? 0}, regola «${c.d.deliveryRule.name}» ${c.d.deliveryRule.partnerBillingAdjustment})`);
  if (APPLICA) {
    await prisma.$transaction([
      ...cambi.map((c) => prisma.invoiceLine.update({ where: { id: c.l.id }, data: { amount: c.nuovo } })),
      prisma.invoice.update({ where: { id: b.id }, data: { netAmount: nuovoNetto, totalAmount: conIva(nuovoNetto) } }),
    ]);
    console.log('   ✓ aggiornata');
  }
}
console.log(`\nTotale: ${bozzeToccate} bozze, ${righeToccate} righe, imponibile ${deltaTot >= 0 ? '+' : ''}${eur(deltaTot)}${APPLICA ? '' : ' — anteprima, niente scritto (usa --applica)'}`);
await prisma.$disconnect();

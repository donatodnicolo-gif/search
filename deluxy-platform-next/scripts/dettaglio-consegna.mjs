// ============================================================
// Dettaglio di una consegna, per capire una paga o un margine
// ------------------------------------------------------------
// Nato il 25/08/2026 dopo il quinto script usa-e-getta per guardare una riga.
// Mette insieme, per ogni consegna richiesta:
//   - lo stato di adesso (luoghi, economia, paga);
//   - il listino del VALET e TUTTE le formule candidate, con quale combacia —
//     ⚠️ il listino si raggiunge da `valetServiceId`, non dal servizio del
//     partner: sullo stesso record convivono due tassonomie;
//   - le altre consegne della stessa vendita (le regole carnet ragionano su
//     quelle);
//   - la riga originale del legacy, per distinguere «importato male» da
//     «sbagliato all'origine»;
//   - il registro, che dice cosa abbiamo cambiato noi e perche'.
//
// NON SCRIVE NIENTE.
//
// Uso: node scripts/dettaglio-consegna.mjs 62976 55610 52966
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { leggiCsv } from './leggi-csv.mjs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const CODICI = process.argv.slice(2).map(Number).filter(Number.isInteger);
if (!CODICI.length) { console.error('Uso: node scripts/dettaglio-consegna.mjs <codice> [codice…]'); process.exit(1); }

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;
const db = new PrismaClient();
const eu = (n) => (n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const r2 = (x) => Math.round(x * 100) / 100;
const uguale = (a, b) => Math.abs(a - b) < 0.011;

let legacy = null;
function rigaLegacy(id) {
  if (legacy === null) {
    const p = path.join(process.cwd(), 'legacy', 'tabelle', 'delivery.csv');
    legacy = fs.existsSync(p) ? new Map(leggiCsv(p).map((r) => [String(r.id), r])) : new Map();
  }
  return legacy.get(String(id));
}

try {
  for (const code of CODICI) {
    const d = await db.delivery.findFirst({
      where: { code },
      select: {
        id: true, code: true, legacyId: true, date: true, status: true, identifier: true, notes: true,
        price: true, additionalPrice: true, productValue: true, deliveryPrice: true,
        valetSalary: true, valetAdditionalPrice: true, payable: true, billable: true,
        distanceKm: true, extraKm: true, extraOutOfCity: true, hours: true,
        pickupAddress: true, recipientAddress: true, valetServiceId: true,
        legacyOrderId: true, legacySaleId: true, realOrderNumber: true, shop: true,
        deliveryRuleId: true, valetDeliveryRuleId: true, isFlexiblePrice: true, flexiblePrice: true,
        partner: { select: { insegna: true, address: true, commissionPercent: true } },
        serviceType: { select: { name: true, pricingModel: true, minHours: true } },
        valet: { select: { id: true, firstName: true, lastName: true, minimumKmIncluded: true, extraOutOfCityPrice: true } },
        province: { select: { code: true } },
        products: { select: { quantity: true, price: true, productName: true,
          product: { select: { price: true, partner: { select: { insegna: true } } } } } },
      },
    });
    if (!d) { console.log(`\n#${code}: non trovata`); continue; }

    const paga = r2((d.valetSalary ?? 0) + (d.valetAdditionalPrice ?? 0));
    const pubblico = r2(d.products.reduce((s, l) => s + (l.price ?? 0) * (l.quantity ?? 1), 0));
    const vv = r2(pubblico + (d.deliveryPrice ?? 0));
    const lordo = d.productValue != null ? r2(vv - d.productValue) : null;

    console.log(`\n${'='.repeat(74)}`);
    console.log(`#${d.code}  ${d.date.toISOString().slice(0, 10)}  ${d.status}  prov ${d.province?.code ?? '—'}  (legacyId ${d.legacyId}, codice ${d.identifier ?? '—'})`);
    console.log(`partner   ${d.partner?.insegna} — fee ${d.partner?.commissionPercent}% — sede ${d.partner?.address ?? '—'}`);
    console.log(`servizio  ${d.serviceType?.name} (${d.serviceType?.pricingModel})`);
    console.log(`valet     ${d.valet ? `${d.valet.firstName} ${d.valet.lastName}` : '—'}`);
    console.log(`ritiro    ${JSON.stringify(d.pickupAddress)}`);
    console.log(`consegna  ${d.recipientAddress}`);
    console.log(`distanza  ${d.distanceKm ?? '—'} km · extraKm ${d.extraKm} · flag fuori citta ${d.extraOutOfCity} · ore ${d.hours ?? '—'}`);
    if (d.notes) console.log(`note      ${String(d.notes).replace(/\s+/g, ' ').slice(0, 110)}`);

    console.log(`\n  ECONOMIA`);
    for (const l of d.products) console.log(`    ${(l.productName ?? '?').slice(0, 42).padEnd(44)} q${l.quantity} riga ${eu(l.price)} catalogo ${eu(l.product?.price)} (di ${l.product?.partner?.insegna ?? '—'})`);
    console.log(`    prezzo pubblico ${eu(pubblico)} · consegna cliente ${eu(d.deliveryPrice)} · valore vendite ${eu(vv)}`);
    console.log(`    dato al partner ${eu(d.productValue)} · guadagno lordo ${eu(lordo)} · netto IVA ${eu(lordo != null ? r2(lordo / 1.22) : null)}`);
    console.log(`    quota a listino ${eu(d.price)} (+ plus/minus ${eu(d.additionalPrice)}) · billable ${d.billable}`);
    if (d.isFlexiblePrice) console.log(`    prezzo flessibile: ${String(d.flexiblePrice ?? '').slice(0, 110)}`);

    console.log(`\n  PAGA DEL VALET: ${eu(paga)}  (base ${eu(d.valetSalary)} + plus/minus ${eu(d.valetAdditionalPrice)}) · payable ${d.payable}`);
    const t = d.valetServiceId
      ? await db.valetService.findUnique({ where: { id: d.valetServiceId },
          select: { salary: true, extraKmPrice: true, salaryPerItem: true, serviceType: { select: { name: true } } } })
      : null;
    if (!t) console.log(`    ⚠️ nessun listino collegato (valetServiceId ${d.valetServiceId ?? 'vuoto'}): la paga non e' verificabile`);
    else {
      const km = d.distanceKm ?? 0, inclusi = d.valet?.minimumKmIncluded ?? 0, fuori = d.valet?.extraOutOfCityPrice ?? 0;
      const pezzi = d.products.reduce((s, l) => s + (l.quantity ?? 1), 0);
      console.log(`    listino «${t.serviceType?.name}»: base ${eu(t.salary)} + ${t.extraKmPrice ?? 0} €/km${t.salaryPerItem ? ` + ${t.salaryPerItem} €/pezzo` : ''}`);
      console.log(`    km inclusi ${inclusi} · tariffa fuori citta ${fuori} €/km`);
      const cand = [
        ['urbano (base + €/km oltre gli inclusi)', r2(t.salary + (t.extraKmPrice ?? 0) * Math.max(0, km - inclusi))],
        ['fuori citta (€/km su tutti i km)', r2(fuori * km)],
        ['a ore (tariffa x ore, col minimo)', r2(t.salary * Math.max(d.hours ?? 0, d.serviceType?.minHours ?? 1))],
        ['solo la base', r2(t.salary)],
        ['magazzino (base + €/pezzo)', r2(t.salary + (t.salaryPerItem ?? 0) * pezzi)],
      ];
      for (const [nome, v] of cand) {
        const ok = uguale(paga, v) || uguale(r2(d.valetSalary ?? 0), v);
        console.log(`      ${ok ? '✓' : ' '} ${nome.padEnd(40)} ${eu(v)}`);
      }
      if (!cand.some(([, v]) => v > 0 && (uguale(paga, v) || uguale(r2(d.valetSalary ?? 0), v))))
        console.log(`      🔴 nessuna formula combacia con ${eu(paga)}`);
    }
    console.log(`    regole collegate: consegna ${d.deliveryRuleId ? 'sì' : 'no'} · carnet valet ${d.valetDeliveryRuleId ? 'sì' : 'no'}`);

    if (d.legacyOrderId) {
      const sorelle = await db.delivery.findMany({
        where: { deletedAt: null, legacyOrderId: d.legacyOrderId },
        select: { code: true, distanceKm: true, valetSalary: true, valetAdditionalPrice: true, payable: true,
          partner: { select: { insegna: true } }, valet: { select: { firstName: true, lastName: true } } },
        orderBy: { code: 'asc' },
      });
      if (sorelle.length > 1) {
        console.log(`\n  LE ALTRE CONSEGNE DELLA STESSA VENDITA (${sorelle.length}, ordine ${d.legacyOrderId})`);
        for (const s of sorelle) console.log(`    #${String(s.code).padEnd(6)} ${String(s.distanceKm ?? '—').padStart(8)} km  paga ${eu((s.valetSalary ?? 0) + (s.valetAdditionalPrice ?? 0)).padStart(11)}  payable ${s.payable ? 'sì' : 'NO'}  ${String(s.partner?.insegna ?? '—').slice(0, 20).padEnd(22)} ${s.valet ? `${s.valet.firstName} ${s.valet.lastName}` : '—'}${s.code === d.code ? '  ← questa' : ''}`);
      }
    }

    const o = rigaLegacy(d.legacyId);
    if (o) {
      console.log(`\n  NEL LEGACY`);
      for (const c of ['pickUpAddress', 'distance', 'expertSalary', 'valetAdditionalPrice', 'additionalValetPlusMinus',
        'price', 'productValue', 'hours', 'serviceName', 'expertServiceId', 'payable', 'deliveryRuleId', 'expertRuleId'])
        if (c in o && o[c] != null && String(o[c]).trim() !== '') console.log(`    ${c.padEnd(26)} ${JSON.stringify(o[c])}`);
    }

    const log = await db.deliveryLog.findMany({ where: { deliveryId: d.id }, orderBy: { createdAt: 'asc' },
      select: { type: true, message: true, createdAt: true } });
    if (log.length) {
      console.log(`\n  REGISTRO (${log.length})`);
      for (const l of log) console.log(`    [${l.createdAt.toISOString().slice(0, 16)}] ${l.type}\n       ${String(l.message).replace(/\s+/g, ' ').slice(0, 300)}`);
    }
  }
} finally {
  await db.$disconnect();
}

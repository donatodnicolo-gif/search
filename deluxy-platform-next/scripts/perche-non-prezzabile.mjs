/**
 * Perche' una consegna non e' prezzabile: casi veri, smontati.
 *
 * ⚠️ Chiama la funzione VERA (`prezzoConsegna()` compilata al volo dal modulo
 * di produzione), non una parafrasi. Un primo tentativo con la diagnosi
 * riscritta a mano dava esempi sbagliati: diceva «non prezzabile» di una
 * consegna che aveva un listino da 12 EUR. La regola va chiesta a chi la
 * applica, non riraccontata.
 *
 * Sola lettura.
 */
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const src = fs.readFileSync('C:/Users/nicol/app/deluxy-platform-next/api/src/invoices/invoices.module.ts', 'utf8');
const js = ts.transpileModule(
  src.slice(src.indexOf('export type ConsegnaDaPrezzare'), src.indexOf('/** Aliquota IVA')),
  { compilerOptions: { target: 'ES2022', module: 'ESNext' } }).outputText;
fs.writeFileSync('C:/Users/nicol/app/deluxy-platform-next/scripts/_prezzo.mjs', js);
const { prezzoConsegna } = await import('./_prezzo.mjs');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const dd = await db.delivery.findMany({
  where: { billable: true, status: { notIn: ['cancelled', 'notDelivered'] },
           invoiceLines: { none: {} }, invoiced: false, OR: [{ price: null }, { price: 0 }] },
  select: { code: true, date: true, price: true, additionalPrice: true, hours: true,
    distanceKm: true, extraKm: true, extraOutOfCity: true, partnerId: true, serviceTypeId: true,
    partner: { select: { insegna: true } },
    serviceType: { select: { name: true, pricingModel: true, basePrice: true, perPiecePrice: true, minHours: true } },
    products: { select: { quantity: true, price: true, productName: true } } },
  orderBy: { date: 'desc' },
});

const listini = new Map((await db.partnerService.findMany())
  .map((l) => [`${l.partnerId}|${l.serviceTypeId}`, l]));

console.log("PERCHE' UNA CONSEGNA NON E' PREZZABILE — casi veri\n");
for (const m of ['PREZZO_FISSO', 'VENDITA', 'A_ORA', 'CORPORATE', 'MAGAZZINO']) {
  const d = dd.find((x) => x.serviceType?.pricingModel === m &&
    !prezzoConsegna(x, listini.get(`${x.partnerId}|${x.serviceTypeId}`) ?? null));
  if (!d) { console.log('─'.repeat(76) + `\n${m}: nessun caso non prezzabile fra quelli letti.`); continue; }
  const l = listini.get(`${d.partnerId}|${d.serviceTypeId}`) ?? null;
  const valore = d.products.reduce((s, p) => s + (p.price ?? 0) * (p.quantity ?? 1), 0);
  console.log('─'.repeat(76));
  console.log(`${m}   consegna #${d.code}  ·  ${d.date.toISOString().slice(0,10)}  ·  ${d.partner?.insegna ?? '—'}`);
  console.log(`   servizio:              ${d.serviceType?.name ?? '—'}`);
  console.log(`   prezzo sulla consegna: ${d.price ?? 0} EUR`);
  console.log(`   listino partner+servizio: ${l ? `price=${l.price} includedKm=${l.includedKm} extraKmPrice=${l.extraKmPrice} pricePerItem=${l.pricePerItem ?? '—'}` : '🔴 NON ESISTE'}`);
  if (m === 'A_ORA') console.log(`   ore: ${d.hours ?? '—'} (minimo ${d.serviceType?.minHours ?? 1})`);
  if (['VENDITA','CORPORATE','MAGAZZINO'].includes(m))
    console.log(`   prodotti: ${d.products.length} · valore ${valore.toFixed(2)} EUR · pezzi ${d.products.reduce((s,p)=>s+(p.quantity??1),0)}`);
  // Il motivo si legge dalla regola, non si indovina.
  const motivo =
    !l && ['PREZZO_FISSO','A_ORA','MAGAZZINO'].includes(m) ? 'il partner non ha un listino per questo servizio: non esiste una tariffa da applicare'
    : m === 'VENDITA' && (l?.price ?? 0) <= 0 ? 'la fee % del listino e\' 0: non si sa quale quota trattenere sul venduto'
    : m === 'VENDITA' && valore <= 0 ? 'i prodotti valgono 0: non c\'e\' un venduto su cui calcolare la fee'
    : m === 'CORPORATE' ? 'i prodotti valgono 0: il corporate si fattura sul loro valore'
    : m === 'A_ORA' ? 'la tariffa oraria del listino e\' 0'
    : m === 'MAGAZZINO' ? 'base e prezzo a pezzo sono entrambi 0'
    : 'la tariffa del listino e\' 0';
  console.log(`   → NON PREZZABILE: ${motivo}`);
}

console.log('─'.repeat(76));
let senzaListino = 0, tariffaZero = 0, valoreZero = 0, tot = 0;
const perModello = {};
for (const d of dd) {
  const l = listini.get(`${d.partnerId}|${d.serviceTypeId}`) ?? null;
  if (prezzoConsegna(d, l)) continue;
  tot++;
  const m = d.serviceType?.pricingModel ?? '—';
  perModello[m] = (perModello[m] ?? 0) + 1;
  const valore = d.products.reduce((s, p) => s + (p.price ?? 0) * (p.quantity ?? 1), 0);
  if (!l) senzaListino++;
  else if (['VENDITA'].includes(m) && valore <= 0) valoreZero++;
  else if (m === 'CORPORATE' && valore <= 0) valoreZero++;
  else tariffaZero++;
}
console.log(`\nSU ${dd.length.toLocaleString('it-IT')} CONSEGNE A PREZZO ZERO, ${tot.toLocaleString('it-IT')} non prezzabili:\n`);
console.log(`   nessun listino per partner+servizio: ${senzaListino}`);
console.log(`   listino esistente ma tariffa/fee a 0: ${tariffaZero}`);
console.log(`   prodotti a valore 0 (vendita/corporate): ${valoreZero}`);
console.log(`\n   per modello: ${Object.entries(perModello).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+v).join(' · ')}`);
await db.$disconnect();

// Secondo giro di verifica, sui campi che il primo non toccava:
//   - il CATALOGO servizi (ServiceType) contro service.csv: nome, modello di
//     prezzo, e i cancellati che non devono risultare attivi;
//   - i km del partner (includedKm / extraOutOfCityPrice), che nel legacy non
//     stanno sul listino ma sul partner (kmIncluded, extraOutSideCityKmPrice);
//   - chi ha servizi di magazzino a listino senza avere il magazzino.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { leggiCsv } from './leggi-csv.mjs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const B = 'C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle/';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1` } } });

const MODELLO = { fixedprice: 'PREZZO_FISSO', hourlyrate: 'A_ORA', sales: 'VENDITA', corporate: 'CORPORATE', warehouseservice: 'MAGAZZINO' };
const serviziLegacy = leggiCsv(B + 'service.csv');
const partnerLegacy = Object.fromEntries(leggiCsv(B + 'partner.csv').map((p) => [p.id, p]));
const listini = leggiCsv(B + 'partner-service.csv').filter((r) => !r.deletedAt);
const perId = Object.fromEntries(serviziLegacy.map((s) => [s.id, s]));

console.log('== CATALOGO SERVIZI ==');
const tipi = await db.serviceType.findMany({ where: { scope: { in: ['partner', 'both'] } },
  select: { legacyId: true, name: true, pricingModel: true, active: true } });
const quiPerLegacy = new Map(tipi.filter((t) => t.legacyId !== null).map((t) => [String(t.legacyId), t]));
let ok = 0; const guai = [];
for (const s of serviziLegacy) {
  const q = quiPerLegacy.get(s.id);
  if (!q) { guai.push(`servizio ${s.id} «${s.serviceName}» NON importato`); continue; }
  const atteso = MODELLO[s.pricingModel];
  if (q.name.trim() !== s.serviceName.trim()) guai.push(`servizio ${s.id}: nome «${q.name}» ≠ «${s.serviceName}»`);
  else if (q.pricingModel !== atteso) guai.push(`servizio ${s.id} «${s.serviceName}»: modello ${q.pricingModel} ≠ ${atteso}`);
  else if (!!s.deletedAt === q.active) guai.push(`servizio ${s.id} «${s.serviceName}»: cancellato nel legacy ma attivo qui`);
  else ok++;
}
console.log(`  servizi legacy: ${serviziLegacy.length} · coincidono in tutto: ${ok}`);
if (guai.length) { console.log('  🔴 problemi:'); for (const g of guai) console.log('     ' + g); }
else console.log('  ✅ nessun problema');

console.log('\n== KM E MAGGIORAZIONI DEL PARTNER ==');
const partners = await db.partner.findMany({ select: { legacyId: true, insegna: true, kmIncluded: true,
  extraOutOfCityPrice: true, hasWarehouse: true,
  services: { select: { includedKm: true, serviceType: { select: { pricingModel: true, name: true } } } } } });
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const uguale = (a, b) => { const x = num(a), y = num(b);
  if (x === null && (y === null || y === 0)) return true;
  if (y === null && (x === null || x === 0)) return true;
  return Math.abs((x ?? 0) - (y ?? 0)) < 0.005; };
const kmGuai = [], extraGuai = [];
for (const p of partners) {
  if (p.legacyId === null) continue;
  const l = partnerLegacy[String(p.legacyId)];
  if (!l) continue;
  if (!uguale(p.kmIncluded, l.kmIncluded)) kmGuai.push(`${p.insegna}: km inclusi ${p.kmIncluded} ≠ ${l.kmIncluded}`);
  if (!uguale(p.extraOutOfCityPrice, l.extraOutSideCityKmPrice)) extraGuai.push(`${p.insegna}: extra fuori citta ${p.extraOutOfCityPrice} ≠ ${l.extraOutSideCityKmPrice}`);
}
console.log(`  km inclusi diversi:        ${kmGuai.length}`);
for (const g of kmGuai.slice(0, 10)) console.log('     ' + g);
console.log(`  extra fuori citta diversi: ${extraGuai.length}`);
for (const g of extraGuai.slice(0, 10)) console.log('     ' + g);

console.log('\n== SERVIZI DI MAGAZZINO NASCOSTI ==');
const nascosti = partners.filter((p) => !p.hasWarehouse && p.services.some((s) => s.serviceType.pricingModel === 'MAGAZZINO'));
console.log(`  partner con listino di magazzino ma senza magazzino: ${nascosti.length}`);
for (const p of nascosti)
  console.log(`     ${p.insegna.slice(0, 30).padEnd(32)} ${p.services.filter((s) => s.serviceType.pricingModel === 'MAGAZZINO').map((s) => s.serviceType.name).join(', ')}`);
await db.$disconnect();

// Importa due cose che il primo giro aveva saltato, per lo stesso motivo:
// avevo cercato una colonna che si chiamasse «fee», e non esiste.
//
// 1) FEE % DEL PARTNER (`Partner.commissionPercent`, oggi 0 su tutti e 267).
//    Nel legacy la percentuale non e' un campo del partner: e' il `price` delle
//    righe di `partner-service` sui servizi con `pricingModel = sales`. Per un
//    servizio di VENDITA quel numero non sono euro, sono punti percentuali —
//    ed e' esattamente la Fee% che la Finanza usa in
//    `feeValue = commissionPercent% x prezzoPartner`.
//    Su 96 partner con servizi di vendita, 94 hanno un'unica percentuale.
//    I 2 che ne hanno due diverse NON si toccano: si scrivono a mano.
//
// 2) FLAG MAGAZZINO (`Partner.hasWarehouse` <- `partner.partnerHasWarehouse`).
//    Serve a smettere di mostrare «Stock Pallet» a chi il magazzino non ce l'ha:
//    la riga a listino esiste davvero, ma l'app originale la nasconde.
//
// Di default non scrive: mostra cosa farebbe. Con --scrivi applica.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { leggiCsv } from './leggi-csv.mjs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const SCRIVI = process.argv.includes('--scrivi');
const B = 'C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle/';

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1` } } });

const servizi = Object.fromEntries(leggiCsv(B + 'service.csv').map((s) => [s.id, s]));
const listini = leggiCsv(B + 'partner-service.csv').filter((r) => !r.deletedAt);
const partnerLegacy = leggiCsv(B + 'partner.csv');

// fee per partner legacy
const fee = {};
const ambigui = [];
for (const r of listini) {
  if (servizi[r.serviceId]?.pricingModel !== 'sales') continue;
  (fee[r.partnerId] ??= new Set()).add(Number(r.price));
}
for (const [id, v] of Object.entries(fee)) if (v.size > 1) { ambigui.push([id, [...v]]); delete fee[id]; }

const magazzino = Object.fromEntries(partnerLegacy.map((p) => [p.id, p.partnerHasWarehouse === '1']));

const nostri = await db.partner.findMany({ select: { id: true, legacyId: true, insegna: true, commissionPercent: true, hasWarehouse: true } });
const cambi = [];
for (const p of nostri) {
  if (p.legacyId === null) continue;
  const k = String(p.legacyId);
  const nuovaFee = fee[k] ? [...fee[k]][0] : null;
  const nuovoMag = magazzino[k] ?? false;
  const dati = {};
  if (nuovaFee !== null && nuovaFee !== p.commissionPercent) dati.commissionPercent = nuovaFee;
  if (nuovoMag !== p.hasWarehouse) dati.hasWarehouse = nuovoMag;
  if (Object.keys(dati).length) cambi.push({ p, dati });
}

console.log(`partner in piattaforma con legacyId: ${nostri.filter((p) => p.legacyId !== null).length}`);
console.log(`da aggiornare: ${cambi.length}`);
console.log(`  fee da scrivere:        ${cambi.filter((c) => c.dati.commissionPercent !== undefined).length}`);
console.log(`  flag magazzino da accendere: ${cambi.filter((c) => c.dati.hasWarehouse === true).length}`);
console.log(`\n⚠️ partner con percentuali DIVERSE fra i loro servizi di vendita: ${ambigui.length} (lasciati com'erano)`);
for (const [id, v] of ambigui) {
  const n = nostri.find((p) => String(p.legacyId) === id);
  console.log(`   legacy ${id} · ${n?.insegna ?? '?'} · percentuali ${v.join(' / ')}`);
}
console.log('\nprimi 12 cambi:');
for (const c of cambi.slice(0, 12))
  console.log(`   ${c.p.insegna.slice(0, 30).padEnd(32)} ${JSON.stringify(c.dati)}`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }

let fatti = 0;
for (const c of cambi) { await db.partner.update({ where: { id: c.p.id }, data: c.dati }); fatti++; }
console.log(`\n✅ aggiornati ${fatti} partner`);

const g = await db.partner.groupBy({ by: ['commissionPercent'], _count: true, orderBy: { _count: { commissionPercent: 'desc' } } });
console.log('\nFEE DOPO L\'IMPORT:');
for (const r of g) console.log(`   ${String(r.commissionPercent).padStart(6)} %  su ${String(r._count).padStart(3)} partner`);
await db.$disconnect();

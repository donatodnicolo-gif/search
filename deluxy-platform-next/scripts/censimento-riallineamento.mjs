/**
 * CENSIMENTO del riallineamento col database originale (export 30/08/2026).
 *
 * SOLA LETTURA: dice che cosa c'è di nuovo nell'export, che cosa manca in
 * piattaforma e dove le associazioni divergono — non tocca niente. Le
 * decisioni sulle divergenze sono dell'utente (regola del 30/08); si caricano
 * in autonomia solo consegne e servizi mancanti, e lo fa un altro script.
 *
 * ⚠️ Le differenze sui campi NON sono per forza errori d'import: la
 * piattaforma ha corretto valori di proposito (prezzi flessibili, ritiri
 * Artista Locale, payable delle gemelle corporate…) e il legacy è andato
 * avanti per conto suo dopo il primo export. Per questo si CONTANO e si
 * mostrano, non si "correggono".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const QUI = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const NUOVO = path.join(QUI, '..', 'legacy-2026-08-30', 'tabelle');

function leggi(nome) {
  const file = path.join(NUOVO, `${nome}.csv`);
  if (!fs.existsSync(file)) return null;
  const testo = fs.readFileSync(file, 'utf8');
  const righe = []; let riga = [], campo = '', inStr = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (inStr) {
      if (c === '"' && testo[i + 1] === '"') { campo += '"'; i++; continue; }
      if (c === '"') { inStr = false; continue; }
      campo += c; continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === ',') { riga.push(campo); campo = ''; continue; }
    if (c === '\n') { riga.push(campo); righe.push(riga); riga = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo !== '' || riga.length) { riga.push(campo); righe.push(riga); }
  const testa = righe[0].map((x) => x.trim());
  return righe.slice(1).filter((r) => r.some((v) => v !== '')).map((r) =>
    Object.fromEntries(testa.map((c, i) => [c, r[i] === 'NULL' ? null : r[i]])));
}
const num = (v) => (v == null || v === '' ? null : Number(v));

const rigaEnv = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();

const STATO = {
  created: 'created', assigned: 'assigned', accepted: 'accepted',
  delivering: 'in_delivery', delivered: 'delivered', notDelivered: 'not_delivered',
  canceled: 'cancelled', requestCancellation: 'cancellation_requested',
  notAccepted: 'not_accepted', deliveredWithTimeToBeApproved: 'delivered_time_to_approve',
  approved: 'approved', invalidated: 'invalidated',
};

// ------------------------- CONSEGNE -------------------------
const exp = leggi('delivery');
console.log('== CONSEGNE ==');
console.log('nel nuovo export:', exp.length);
const inCasa = new Map((await prisma.delivery.findMany({
  where: { legacyId: { not: null } },
  select: { legacyId: true, status: true, price: true, valetSalary: true, productValue: true,
    invoiced: true, payable: true,
    partner: { select: { legacyId: true } }, valet: { select: { legacyId: true } } },
})).map((d) => [d.legacyId, d]));
console.log('in piattaforma (con legacyId):', inCasa.size);

const mancanti = [];
const diff = { status: 0, partner: 0, valet: 0, salary: 0, price: 0, productValue: 0, invoiced: 0 };
const esempi = [];
for (const r of exp) {
  const id = num(r.id);
  const mia = inCasa.get(id);
  if (!mia) { mancanti.push(r); continue; }
  const d = [];
  if ((STATO[r.status] ?? r.status) !== mia.status) { diff.status++; d.push(`status ${r.status}->${mia.status}`); }
  if (num(r.partnerId) !== (mia.partner?.legacyId ?? null)) { diff.partner++; d.push(`partner ${r.partnerId}!=${mia.partner?.legacyId}`); }
  if (num(r.expertId) !== (mia.valet?.legacyId ?? null)) { diff.valet++; d.push(`valet ${r.expertId}!=${mia.valet?.legacyId}`); }
  const cmp = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.005);
  if (!cmp(num(r.expertSalary), mia.valetSalary)) { diff.salary++; d.push(`paga ${r.expertSalary}!=${mia.valetSalary}`); }
  if (!cmp(num(r.price), mia.price)) { diff.price++; d.push(`price ${r.price}!=${mia.price}`); }
  if (!cmp(num(r.productValue), mia.productValue)) { diff.productValue++; }
  if ((r.invoiced === '1') !== mia.invoiced) diff.invoiced++;
  if (d.length && esempi.length < 6) esempi.push(`#${id}: ${d.join(', ')}`);
}
console.log('MANCANTI in piattaforma:', mancanti.length);
if (mancanti.length) {
  const perStato = {};
  for (const m of mancanti) perStato[m.status] = (perStato[m.status] ?? 0) + 1;
  const date = mancanti.map((m) => m.deliveryDate).filter(Boolean).sort();
  console.log('  per stato:', JSON.stringify(perStato));
  console.log('  date:', date[0], '->', date[date.length - 1]);
}
console.log('divergenze sulle presenti:', JSON.stringify(diff));
esempi.forEach((e) => console.log('   es.', e));

// ------------------------- SERVIZI -------------------------
console.log('\n== CATALOGHI E LISTINI ==');
const servPartner = leggi('service');
const tipiPartner = new Set((await prisma.serviceType.findMany({
  where: { legacyId: { not: null, lt: 900000 } }, select: { legacyId: true } })).map((t) => t.legacyId));
const servPartnerNuovi = servPartner.filter((s) => !tipiPartner.has(num(s.id)));
console.log(`catalogo PARTNER (service): export ${servPartner.length} · nuovi: ${servPartnerNuovi.length}`,
  servPartnerNuovi.map((s) => `${s.id}:${s.serviceName}`).join(' | '));

const servValet = leggi('tabella-38');
const tipiValet = new Set((await prisma.serviceType.findMany({
  where: { legacyId: { gte: 900000 } }, select: { legacyId: true } })).map((t) => t.legacyId - 900000));
const servValetNuovi = (servValet ?? []).filter((s) => !tipiValet.has(num(s.id)));
console.log(`catalogo VALET (tabella-38): export ${servValet?.length ?? '-'} · nuovi: ${servValetNuovi.length}`,
  servValetNuovi.map((s) => `${s.id}:${s.serviceName}`).join(' | '));

const listValet = leggi('expert-service');
const listValetMiei = new Set((await prisma.valetService.findMany({
  where: { legacyId: { not: null } }, select: { legacyId: true } })).map((x) => x.legacyId));
const listValetNuovi = listValet.filter((x) => !listValetMiei.has(num(x.id)));
console.log(`listino VALET (expert-service): export ${listValet.length} · non collegati per legacyId: ${listValetNuovi.length}`);

// ⚠️ PartnerService NON conserva il legacyId: il confronto puntuale non si
// può fare. Il conteggio però basta a dire se l'export ne porta di nuovi
// (il vecchio export ne aveva 528, la piattaforma 531 — righe aggiunte qui).
const listPartner = leggi('partner-service');
const listPartnerMiei = await prisma.partnerService.count();
console.log(`listino PARTNER (partner-service): export ${listPartner.length} · in piattaforma ${listPartnerMiei} (confronto solo a conteggio: manca il legacyId)`);

// ------------------------- LE ALTRE TABELLE -------------------------
console.log('\n== ALTRE TABELLE (mancanti per legacyId) ==');
const confronti = [
  ['partner', 'partner'],
  ['expert', 'valet'],
  ['customer', 'customer'],
  ['user', 'user'],
  ['product', 'product'],
  ['products-variants', 'productVariant'],
  ['delivery-product', 'deliveryProduct'],
  // valet-activities e delivery-updates non hanno un legacyId qui: si contano
  // e basta (i log nuovi nascono in piattaforma, non si confrontano per id).
  ['valet-activities', null],
  ['delivery-updates', null],
  ['expert-receipts', 'receipt'],
];
for (const [csv, modello] of confronti) {
  const righe = leggi(csv);
  if (!righe) { console.log(`${csv}: CSV assente`); continue; }
  if (!modello) { console.log(`${csv.padEnd(20)} export ${righe.length} (senza modello qui: solo conteggio)`); continue; }
  const miei = new Set((await prisma[modello].findMany({
    where: { legacyId: { not: null } }, select: { legacyId: true } })).map((x) => x.legacyId));
  const nuovi = righe.filter((r) => r.id != null && !miei.has(num(r.id)));
  console.log(`${csv.padEnd(20)} export ${String(righe.length).padStart(6)} · in piattaforma ${String(miei.size).padStart(6)} · NUOVI ${nuovi.length}`);
}
await prisma.$disconnect();

/**
 * Ripara un mio errore e completa le liste di priorità.
 *
 * ⚠️ Avevo letto `tabella-53` (`productCategoryId + provinceId`) come «dove si
 * vende una categoria» e le avevo costruito una tabella nuova,
 * `CategoryProvince`. Sbagliato: quella tabella è la TESTA delle liste di
 * priorità — «per questa categoria in questa provincia, ecco i partner in
 * ordine» — e qui esisteva già come `PriorityList`, con gli stessi legacyId.
 * Avevo creato un doppione.
 *
 * Il nome di una tabella non dice cosa contiene. `productCategoryId +
 * provinceId` è la stessa forma per due significati opposti: un elenco di
 * copertura e la chiave di una lista ordinata. A distinguerli è la tabella che
 * ci si appoggia — `tabella-54` porta i partner IN ORDINE, e un elenco di
 * copertura non avrebbe un ordine.
 *
 * Questo script:
 *  1. cancella `CategoryProvince` (il doppione),
 *  2. importa le liste di priorità che mancavano davvero.
 *
 * Prova a vuoto di default. `--scrivi` per applicare.
 */
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
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

console.log(SCRIVI ? 'SCRITTURA' : 'PROVA A VUOTO — rilancia con --scrivi');

// ── 1. Il doppione ──────────────────────────────────────────────────────────
const doppioni = await db.categoryProvince.count();
console.log('\nCategoryProvince (la tabella sbagliata): ' + doppioni + ' righe da cancellare');
if (SCRIVI && doppioni) {
  const r = await db.categoryProvince.deleteMany({});
  console.log('  cancellate: ' + r.count);
}

// ── 2. Le liste che mancano davvero ─────────────────────────────────────────
const t53 = leggiCsv(B + 'tabella-53.csv').filter((r) => !r.deletedAt);
const t54 = leggiCsv(B + 'tabella-54.csv').filter((r) => !r.deletedAt);

const gia = new Set((await db.priorityList.findMany({ where: { NOT: { legacyId: null } }, select: { legacyId: true } }))
  .map((x) => String(x.legacyId)));
const cat = new Map((await db.category.findMany({ where: { NOT: { legacyId: null } }, select: { id: true, legacyId: true, name: true } }))
  .map((x) => [String(x.legacyId), x]));
const prov = new Map((await db.province.findMany({ where: { NOT: { legacyId: null } }, select: { id: true, legacyId: true, code: true } }))
  .map((x) => [String(x.legacyId), x]));
const partner = new Map((await db.partner.findMany({ where: { NOT: { legacyId: null } }, select: { id: true, legacyId: true, insegna: true } }))
  .map((x) => [String(x.legacyId), x]));

// La coppia (provincia, categoria) è unica: una lista già presente con altro
// legacyId occuperebbe il posto, e va vista prima di provare a scrivere.
const coppieGia = new Set((await db.priorityList.findMany({ select: { provinceId: true, categoryId: true } }))
  .map((x) => `${x.provinceId}|${x.categoryId}`));

const daFare = [];
const scartate = [];
for (const r of t53) {
  if (gia.has(String(r.id))) continue;
  const c = cat.get(String(r.productCategoryId));
  const p = prov.get(String(r.provinceId));
  if (!c || !p) { scartate.push({ id: r.id, perche: !c ? 'categoria assente' : 'provincia assente' }); continue; }
  if (coppieGia.has(`${p.id}|${c.id}`)) { scartate.push({ id: r.id, perche: `${c.name}/${p.code} c'è già con un altro id` }); continue; }
  daFare.push({ legacyId: Number(r.id), categoryId: c.id, provinceId: p.id, etichetta: `${c.name} / ${p.code}` });
}

console.log('\nLISTE DI PRIORITÀ — ' + t53.length + ' nel legacy, ' + gia.size + ' già qui');
console.log('  ⭐ da importare: ' + daFare.length);
for (const x of daFare) console.log('     legacyId=' + String(x.legacyId).padEnd(5) + x.etichetta);
if (scartate.length) {
  console.log('  scartate: ' + scartate.length);
  for (const x of scartate) console.log('     legacyId=' + String(x.id).padEnd(5) + x.perche);
}

// Le voci di quelle liste: senza, la lista esiste ma non ordina nessuno.
const vociDaFare = t54.filter((v) => daFare.some((l) => String(l.legacyId) === String(v.partnerPriorityId)));
console.log('  voci (partner in ordine) che le riempiono: ' + vociDaFare.length);
for (const v of vociDaFare) {
  const p = partner.get(String(v.partnerId));
  console.log('     lista ' + v.partnerPriorityId + ' · posto ' + (v.order ?? '?') + ' · ' + (p?.insegna ?? ('partner ' + v.partnerId + ' NON QUI')));
}

if (!SCRIVI) { await db.$disconnect(); process.exit(0); }

let liste = 0, voci = 0;
for (const l of daFare) {
  const creata = await db.priorityList.create({
    data: { legacyId: l.legacyId, categoryId: l.categoryId, provinceId: l.provinceId },
  });
  liste++;
  for (const v of t54.filter((x) => String(x.partnerPriorityId) === String(l.legacyId))) {
    const p = partner.get(String(v.partnerId));
    if (!p) continue;
    await db.priorityEntry.create({
      data: { listId: creata.id, partnerId: p.id, position: Number(v.order) || 1, legacyId: Number(v.id) || null },
    });
    voci++;
  }
}
console.log('\nliste create: ' + liste + ' · voci create: ' + voci);
console.log('totale liste: ' + (await db.priorityList.count()) + ' · totale voci: ' + (await db.priorityEntry.count()));
await db.$disconnect();

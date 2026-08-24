// Importa le LISTE PRIORITA' per (provincia, categoria) dal database originario.
//
// Sono il cuore dello smistamento dei prodotti NON UNICI: quando arriva un
// ordine si scorre la lista nell'ordine deciso e si propone al primo partner
// aperto. Nel legacy stanno in due tabelle senza nome che nessuno aveva mai
// aperto: `tabella-53` (le liste, 29) e `tabella-54` (i partner dentro, 49).
//
// ⚠️ Fino al 24/08/2026 lo smistamento usava `PartnerCategory` al loro posto —
// che dice solo QUALI categorie tratta un partner, senza provincia. E le sue
// 455 righe avevano tutte `priority = 0`: ordinava per un campo uguale per
// tutti, cioe' sceglieva a caso fra i partner della provincia.
//
// Di default non scrive. Con --scrivi applica.
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

const liste = leggiCsv(B + 'tabella-53.csv').filter((r) => !r.deletedAt);
const dentro = leggiCsv(B + 'tabella-54.csv').filter((r) => !r.deletedAt);

const province = new Map((await db.province.findMany({ where: { NOT: { legacyId: null } }, select: { id: true, legacyId: true, code: true } })).map((x) => [String(x.legacyId), x]));
const categorie = new Map((await db.category.findMany({ where: { NOT: { legacyId: null } }, select: { id: true, legacyId: true, name: true } })).map((x) => [String(x.legacyId), x]));
const partner = new Map((await db.partner.findMany({ where: { NOT: { legacyId: null } }, select: { id: true, legacyId: true, insegna: true } })).map((x) => [String(x.legacyId), x]));

const piano = [];
const saltate = { provincia: 0, categoria: 0, partner: 0, vuote: 0 };
for (const l of liste) {
  const pr = province.get(String(l.provinceId));
  const ca = categorie.get(String(l.productCategoryId));
  if (!pr) { saltate.provincia++; continue; }
  if (!ca) { saltate.categoria++; continue; }
  const righe = dentro
    .filter((d) => d.partnerPriorityId === l.id)
    .sort((a, b) => Number(a.order) - Number(b.order));
  if (!righe.length) { saltate.vuote++; continue; }
  const partners = [];
  for (const r of righe) {
    const pa = partner.get(String(r.partnerId));
    if (!pa) { saltate.partner++; continue; }
    partners.push({ legacyId: Number(r.id), partnerId: pa.id, position: Number(r.order) || partners.length + 1, insegna: pa.insegna });
  }
  if (!partners.length) { saltate.vuote++; continue; }
  piano.push({ legacyId: Number(l.id), provinceId: pr.id, categoryId: ca.id, etichetta: `${pr.code} · ${ca.name}`, partners });
}

console.log(`liste nel legacy: ${liste.length} · partner dentro: ${dentro.length}`);
console.log(`🔵 liste importabili: ${piano.length} · partner in tutto: ${piano.reduce((s, x) => s + x.partners.length, 0)}`);
console.log(`   saltate — provincia sconosciuta: ${saltate.provincia} · categoria sconosciuta: ${saltate.categoria} · senza partner: ${saltate.vuote} · partner sconosciuti: ${saltate.partner}`);
console.log('\nle liste:');
for (const x of piano.slice(0, 14))
  console.log(`   ${x.etichetta.slice(0, 34).padEnd(36)} ${x.partners.map((p) => `${p.position}. ${p.insegna.slice(0, 18)}`).join('  ')}`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }

let liste_ok = 0, righe_ok = 0;
for (const x of piano) {
  const lista = await db.priorityList.upsert({
    where: { provinceId_categoryId: { provinceId: x.provinceId, categoryId: x.categoryId } },
    update: { legacyId: x.legacyId },
    create: { legacyId: x.legacyId, provinceId: x.provinceId, categoryId: x.categoryId },
  });
  liste_ok++;
  for (const p of x.partners) {
    await db.priorityEntry.upsert({
      where: { listId_partnerId: { listId: lista.id, partnerId: p.partnerId } },
      update: { position: p.position, legacyId: p.legacyId },
      create: { listId: lista.id, partnerId: p.partnerId, position: p.position, legacyId: p.legacyId },
    });
    righe_ok++;
  }
}
console.log(`\n✅ liste ${liste_ok} · partner nelle liste ${righe_ok}`);
console.log('   in piattaforma ora:', await db.priorityList.count(), 'liste ·', await db.priorityEntry.count(), 'righe');
await db.$disconnect();

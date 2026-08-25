/**
 * Importa due tabelle che nel nuovo ambiente non erano mai arrivate:
 *
 *  1. CATEGORIA ↔ PROVINCIA (`tabella-53`, 29 righe): dove si vende una
 *     categoria di prodotti. ⚠️ Non è lo sconto per provincia — quello è
 *     un'altra cosa e c'è già. Le categorie SENZA righe si vendono ovunque:
 *     confondere «nessuna riga» con «da nessuna parte» spegnerebbe il catalogo.
 *
 *  2. MODELLI SMS (`tabella-78`, 31 righe): i testi che il cliente riceve
 *     quando la consegna nasce, parte o arriva. Sono PER PARTNER — ogni
 *     pasticceria ha il suo modo di scrivere — e qui ce n'erano solo 5 generici.
 *
 * ⚠️ Il legacy chiama gli eventi `Created` / `Started` / `Arrived`; qui i
 * trigger sono `CREATED` / `DEPARTED` / `ARRIVED`. `Started` → `DEPARTED` è la
 * traduzione meno ovvia: «partita», non «iniziata».
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

const vuoto = (v) => { const t = String(v ?? '').trim().toLowerCase(); return !t || t === 'null'; };
const n = (x) => x.toLocaleString('it-IT');

// ── indici legacyId → id nuovo ──────────────────────────────────────────────
const categorie = new Map((await db.category.findMany({ where: { NOT: { legacyId: null } }, select: { id: true, legacyId: true, name: true } }))
  .map((x) => [String(x.legacyId), x]));
const province = new Map((await db.province.findMany({ where: { NOT: { legacyId: null } }, select: { id: true, legacyId: true, name: true, code: true } }))
  .map((x) => [String(x.legacyId), x]));
const partner = new Map((await db.partner.findMany({ where: { NOT: { legacyId: null } }, select: { id: true, legacyId: true, insegna: true } }))
  .map((x) => [String(x.legacyId), x]));

console.log(SCRIVI ? 'SCRITTURA' : 'PROVA A VUOTO — rilancia con --scrivi');

// ══════════════════════ 1. CATEGORIA ↔ PROVINCIA ═══════════════════════════
{
  const righe = leggiCsv(B + 'tabella-53.csv').filter((r) => !r.deletedAt);
  const gia = new Set((await db.categoryProvince.findMany({ select: { categoryId: true, provinceId: true } }))
    .map((x) => `${x.categoryId}|${x.provinceId}`));
  const nuove = [];
  let senzaCat = 0, senzaProv = 0, gia_ = 0;
  for (const r of righe) {
    const c = categorie.get(String(r.productCategoryId));
    const p = province.get(String(r.provinceId));
    if (!c) { senzaCat++; continue; }
    if (!p) { senzaProv++; continue; }
    if (gia.has(`${c.id}|${p.id}`)) { gia_++; continue; }
    nuove.push({ legacyId: Number(r.id) || null, categoryId: c.id, provinceId: p.id });
  }
  console.log('');
  console.log('CATEGORIA ↔ PROVINCIA — ' + n(righe.length) + ' righe nel legacy');
  console.log('  categoria non trovata: ' + senzaCat + ' · provincia non trovata: ' + senzaProv + ' · già presenti: ' + gia_);
  console.log('  ⭐ da importare: ' + n(nuove.length));
  const perCat = {};
  for (const r of righe) {
    const c = categorie.get(String(r.productCategoryId));
    const p = province.get(String(r.provinceId));
    if (c && p) (perCat[c.name] ??= []).push(p.code ?? p.name);
  }
  for (const [cat, prov] of Object.entries(perCat).slice(0, 6)) {
    console.log('     ' + cat.slice(0, 30).padEnd(32) + prov.join(', ').slice(0, 60));
  }
  if (SCRIVI && nuove.length) {
    const r = await db.categoryProvince.createMany({ data: nuove, skipDuplicates: true });
    console.log('  importate: ' + n(r.count));
  }
}

// ══════════════════════════ 2. MODELLI SMS ═════════════════════════════════
{
  // ⚠️ `Started` significa «partita», non «iniziata»: il trigger qui è DEPARTED.
  const TRIGGER = { Created: 'CREATED', Started: 'DEPARTED', Arrived: 'ARRIVED' };
  const ETICHETTA = { CREATED: 'creata', DEPARTED: 'partita', ARRIVED: 'arrivata' };

  const righe = leggiCsv(B + 'tabella-78.csv').filter((r) => !r.deletedAt);
  const gia = new Set((await db.smsTemplate.findMany({ where: { NOT: { legacyId: null } }, select: { legacyId: true } }))
    .map((x) => String(x.legacyId)));
  const nuovi = [];
  let senzaTesto = 0, senzaTrigger = 0, senzaPartner = 0, gia_ = 0;
  for (const r of righe) {
    if (gia.has(String(r.id))) { gia_++; continue; }
    const trigger = TRIGGER[String(r.temp_type ?? '').trim()];
    if (!trigger) { senzaTrigger++; continue; }
    const testo = String(r.description ?? '').trim();
    if (!testo) { senzaTesto++; continue; }
    const p = vuoto(r.partnerId) ? null : partner.get(String(r.partnerId));
    if (!vuoto(r.partnerId) && !p) { senzaPartner++; continue; }
    nuovi.push({
      legacyId: Number(r.id) || null,
      // ⚠️ `brand` è obbligatorio e nel legacy non esiste: questi modelli si
      // distinguono per PARTNER, non per marca. Si mette DELUXY e il partner
      // fa il resto — inventare una marca per riga sarebbe un dato falso.
      brand: 'DELUXY',
      trigger,
      name: `${p?.insegna ?? 'Generico'} — ${ETICHETTA[trigger]}`.slice(0, 120),
      text: testo,
      partnerId: p?.id ?? null,
      active: true,
    });
  }
  console.log('');
  console.log('MODELLI SMS — ' + n(righe.length) + ' righe nel legacy');
  console.log('  senza trigger riconosciuto: ' + senzaTrigger + ' · senza testo: ' + senzaTesto +
    ' · partner non trovato: ' + senzaPartner + ' · già presenti: ' + gia_);
  console.log('  ⭐ da importare: ' + n(nuovi.length));
  const perTrig = {};
  for (const x of nuovi) perTrig[x.trigger] = (perTrig[x.trigger] ?? 0) + 1;
  console.log('     per evento: ' + Object.entries(perTrig).map(([k, q]) => k + '=' + q).join(' · '));
  for (const x of nuovi.slice(0, 4)) {
    console.log('     ' + x.name.slice(0, 34).padEnd(36) + x.text.replace(/\s+/g, ' ').slice(0, 56));
  }
  if (SCRIVI && nuovi.length) {
    const r = await db.smsTemplate.createMany({ data: nuovi, skipDuplicates: true });
    console.log('  importati: ' + n(r.count));
    console.log('  totale in tabella: ' + n(await db.smsTemplate.count()));
  }
}

await db.$disconnect();

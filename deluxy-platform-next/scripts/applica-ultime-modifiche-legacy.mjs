/**
 * APPLICA LE ULTIME MODIFICHE DEL LEGACY (fra il primo e il secondo export).
 *
 * Il gestionale vecchio è stato SPENTO il 31/08/2026: il secondo export è la
 * sua fotografia finale. Questo script porta in piattaforma SOLO ciò che il
 * legacy ha cambiato DOPO il primo export (26/08): sono le sue ultime
 * modifiche vere — consegne concluse, paghe scritte, valet assegnati,
 * annullamenti.
 *
 * ⚠️ Il criterio NON è «legacy diverso da piattaforma»: su quel criterio si
 * sovrascriverebbero le 460 correzioni fatte QUI di proposito (già tutte
 * spiegate dall'audit del 28/08: 88 da backup di script, 372 con nota nel
 * registro). Il criterio è «il LEGACY stesso ha cambiato il valore fra i due
 * export»: quello è lavoro loro, e va rispettato.
 *
 * In più: le ASSEGNAZIONI VALET dove qui il campo è vuoto (58) — riempire un
 * vuoto non sovrascrive niente.
 *
 * Se una consegna cade in ENTRAMBI i mondi (il legacy l'ha cambiata E qui c'è
 * una correzione registrata) NON si tocca: finisce nell'elenco dei conflitti.
 *
 * Simula di default; scrive con --applica; backup in
 * scripts/backup-ultime-modifiche-legacy.json; DeliveryLog su ogni cambio.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const APPLICA = process.argv.includes('--applica');
const QUI = path.resolve(fileURLToPath(new URL('.', import.meta.url)));

function leggi(base, nome) {
  const testo = fs.readFileSync(path.join(QUI, '..', base, 'tabelle', `${nome}.csv`), 'utf8');
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
const uguali = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.005);

const rigaEnv = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();

const STATO = {
  created: 'created', assigned: 'assigned', accepted: 'accepted', delivering: 'in_delivery',
  delivered: 'delivered', notDelivered: 'not_delivered', canceled: 'cancelled',
  requestCancellation: 'cancellation_requested', notAccepted: 'not_accepted',
  deliveredWithTimeToBeApproved: 'delivered_time_to_approve', approved: 'approved', invalidated: 'invalidated',
};

// --- gli indici -------------------------------------------------------------
const vecchio = new Map(leggi('legacy', 'delivery').map((r) => [Number(r.id), r]));
const valetPerLegacy = new Map((await prisma.valet.findMany({
  where: { legacyId: { not: null } }, select: { id: true, legacyId: true } })).map((v) => [v.legacyId, v.id]));
const partnerPerLegacy = new Map((await prisma.partner.findMany({
  where: { legacyId: { not: null } }, select: { id: true, legacyId: true } })).map((v) => [v.legacyId, v.id]));
const mie = new Map((await prisma.delivery.findMany({ where: { legacyId: { not: null } },
  select: { id: true, legacyId: true, status: true, valetSalary: true, price: true, productValue: true,
    valetId: true, partnerId: true, valet: { select: { legacyId: true } }, partner: { select: { legacyId: true } } },
})).map((d) => [d.legacyId, d]));
// le consegne con una correzione NOSTRA nel registro: in conflitto non si toccano
const corrette = new Set((await prisma.$queryRawUnsafe(
  `SELECT DISTINCT d."legacyId" FROM platform."DeliveryLog" l
   JOIN platform."Delivery" d ON d.id = l."deliveryId"
   WHERE l.type NOT IN ('created','departed','delivered','status_change','legacy_update','rinumerata')
     AND d."legacyId" IS NOT NULL`)).map((x) => x.legacyId));

const cambi = [];      // {id, code, campo, da, a, dato}
const conflitti = [];  // da mostrare, non toccare
let vuotiRiempiti = 0;

for (const r of leggi('legacy-2026-08-30', 'delivery')) {
  const id = Number(r.id);
  const prima = vecchio.get(id);
  const mia = mie.get(id);
  if (!mia) continue;

  const proposte = [];

  if (prima) {
    // 1. STATO cambiato nel legacy dopo il primo export
    if ((r.status ?? '') !== (prima.status ?? '')) {
      const nuovo = STATO[r.status];
      if (nuovo && nuovo !== mia.status) proposte.push({ campo: 'status', da: mia.status, a: nuovo, dato: { status: nuovo } });
    }
    // 2. PAGA cambiata nel legacy
    if (!uguali(num(r.expertSalary), num(prima.expertSalary))) {
      const nuovo = num(r.expertSalary);
      if (!uguali(nuovo, mia.valetSalary)) proposte.push({ campo: 'paga', da: mia.valetSalary, a: nuovo, dato: { valetSalary: nuovo } });
    }
    // 3. PREZZO partner cambiato nel legacy
    if (!uguali(num(r.price), num(prima.price))) {
      const nuovo = num(r.price);
      if (!uguali(nuovo, mia.price)) proposte.push({ campo: 'price', da: mia.price, a: nuovo, dato: { price: nuovo } });
    }
    // 4. VALORE merce cambiato nel legacy
    if (!uguali(num(r.productValue), num(prima.productValue))) {
      const nuovo = num(r.productValue);
      if (!uguali(nuovo, mia.productValue)) proposte.push({ campo: 'productValue', da: mia.productValue, a: nuovo, dato: { productValue: nuovo } });
    }
    // 5. VALET cambiato nel legacy
    if (num(r.expertId) !== num(prima.expertId)) {
      const nuovoLegacy = num(r.expertId);
      const nuovoId = nuovoLegacy == null ? null : valetPerLegacy.get(nuovoLegacy);
      if (nuovoLegacy != null && !nuovoId) { /* valet non mappato: si dichiara */ }
      else if ((mia.valet?.legacyId ?? null) !== nuovoLegacy) {
        proposte.push({ campo: 'valet', da: mia.valet?.legacyId ?? null, a: nuovoLegacy, dato: { valetId: nuovoId ?? null } });
      }
    }
    // 6. PARTNER cambiato nel legacy
    if (num(r.partnerId) !== num(prima.partnerId)) {
      const nuovoLegacy = num(r.partnerId);
      const nuovoId = nuovoLegacy == null ? null : partnerPerLegacy.get(nuovoLegacy);
      if (nuovoId && (mia.partner?.legacyId ?? null) !== nuovoLegacy) {
        proposte.push({ campo: 'partner', da: mia.partner?.legacyId ?? null, a: nuovoLegacy, dato: { partnerId: nuovoId } });
      }
    }
  }

  // 7. Assegnazione che RIEMPIE un vuoto (anche se il legacy non l'ha cambiata
  //    dopo il primo export: qui non si sovrascrive niente).
  if (mia.valetId == null && num(r.expertId) != null) {
    const nuovoId = valetPerLegacy.get(num(r.expertId));
    if (nuovoId && !proposte.some((p) => p.campo === 'valet')) {
      proposte.push({ campo: 'valet(vuoto)', da: null, a: num(r.expertId), dato: { valetId: nuovoId } });
      vuotiRiempiti++;
    }
  }

  if (!proposte.length) continue;
  if (corrette.has(id)) {
    conflitti.push({ id, proposte: proposte.map((p) => `${p.campo}: ${p.da} -> ${p.a}`) });
    continue;
  }
  for (const p of proposte) cambi.push({ deliveryId: mia.id, legacyId: id, ...p });
}

const perCampo = {};
for (const c of cambi) perCampo[c.campo] = (perCampo[c.campo] ?? 0) + 1;
console.log('cambi da applicare:', cambi.length, JSON.stringify(perCampo));
console.log('  di cui vuoti riempiti (valet):', vuotiRiempiti);
console.log('CONFLITTI (correzione nostra + modifica legacy) — NON toccati:', conflitti.length);
conflitti.slice(0, 8).forEach((c) => console.log(`   #${c.legacyId ?? c.id}: ${c.proposte.join(', ')}`));

if (!APPLICA) {
  console.log('\nPROVA A VUOTO: niente scritto. Rilancia con --applica.');
} else {
  fs.writeFileSync(path.join(QUI, 'backup-ultime-modifiche-legacy.json'),
    JSON.stringify({ cambi, conflitti }, null, 2));
  let fatte = 0;
  // raggruppa per consegna: un update e UNA riga di registro per consegna
  const perConsegna = new Map();
  for (const c of cambi) {
    const e = perConsegna.get(c.deliveryId) ?? { dato: {}, descr: [] };
    Object.assign(e.dato, c.dato);
    e.descr.push(`${c.campo}: ${c.da ?? '—'} -> ${c.a ?? '—'}`);
    perConsegna.set(c.deliveryId, e);
  }
  for (const [deliveryId, e] of perConsegna) {
    await prisma.$transaction([
      prisma.delivery.update({ where: { id: deliveryId }, data: e.dato }),
      prisma.deliveryLog.create({ data: {
        deliveryId, type: 'riallineamento-legacy',
        message: `Ultime modifiche del gestionale precedente (spento il 31/08/2026): ${e.descr.join(' · ')}.`,
      } }),
    ]);
    fatte++;
    if (fatte % 50 === 0) process.stdout.write(`\r  aggiornate ${fatte}/${perConsegna.size}`);
  }
  console.log(`\nAGGIORNATE: ${fatte} consegne (backup in scripts/backup-ultime-modifiche-legacy.json)`);
}
await prisma.$disconnect();

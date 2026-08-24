// Gli orari di apertura che erano rimasti fuori: due tabelle senza nome.
//
//   tabella-5 -> orari SETTIMANALI (partnerId|expertId, dayOfWeek, isClosed, slots)
//   tabella-4 -> eccezioni PER DATA (partnerId|expertId, date, isClosed, slots, note)
//
// Sono piccole - 77 e 57 righe - ma sono l'unico posto dove sta l'orario
// settimanale di un partner. In piattaforma `OpeningHour` aveva 13 righe su 2
// partner, cioe' solo il seed.
//
// ⚠️ Il grosso degli orari NON e' qui: il vero calendario dei partner e' quello
// per data (`partner-time-availability`, 113.191 righe, 58 partner) gia'
// importato in PartnerDaySlot. La settimana e' l'eccezione, non la regola.
//
// Ogni riga ha al massimo UNA fascia (verificato: 37 righe con una, 40 con
// nessuna), quindi passando da `slots` a openTime/closeTime non si perde nulla.
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

const fascia = (v) => { try { const s = JSON.parse(v || '[]'); return s[0] ?? null; } catch { return null; } };
const giorno = (v) => new Date(`${String(v).slice(0, 10)}T00:00:00.000Z`);

const partners = new Map((await db.partner.findMany({ where: { NOT: { legacyId: null } }, select: { id: true, legacyId: true, insegna: true } })).map((p) => [String(p.legacyId), p]));
const valets = new Map((await db.valet.findMany({ where: { NOT: { legacyId: null } }, select: { id: true, legacyId: true, firstName: true, lastName: true } })).map((v) => [String(v.legacyId), v]));

// --- settimanali (solo partner: per i valet non esiste un modello settimanale)
const settimanali = leggiCsv(B + 'tabella-5.csv').filter((r) => r.partnerId);
const orari = [];
for (const r of settimanali) {
  const p = partners.get(String(r.partnerId));
  if (!p) continue;
  const f = fascia(r.slots);
  orari.push({ partnerId: p.id, insegna: p.insegna, dayOfWeek: Number(r.dayOfWeek),
    closed: r.isClosed === '1', openTime: f?.start ?? null, closeTime: f?.end ?? null });
}
const valetSettimanali = leggiCsv(B + 'tabella-5.csv').filter((r) => r.expertId).length;

// --- eccezioni per data
const eccezioni = leggiCsv(B + 'tabella-4.csv');
const eccPartner = [], eccValet = [];
for (const r of eccezioni) {
  const f = fascia(r.slots);
  if (r.partnerId) {
    const p = partners.get(String(r.partnerId));
    if (p) eccPartner.push({ partnerId: p.id, insegna: p.insegna, date: giorno(r.date),
      closed: r.isClosed === '1', openTime: f?.start ?? null, closeTime: f?.end ?? null, note: r.note || null });
  } else if (r.expertId) {
    const v = valets.get(String(r.expertId));
    if (v) eccValet.push({ valetId: v.id, chi: `${v.firstName} ${v.lastName}`, date: giorno(r.date),
      available: r.isClosed !== '1', timeFrom: f?.start ?? null, timeTo: f?.end ?? null, note: r.note || null });
  }
}

console.log(`orari SETTIMANALI di partner: ${orari.length} (su ${new Set(orari.map((o) => o.partnerId)).size} partner)`);
for (const o of orari.slice(0, 6)) console.log(`   ${o.insegna.slice(0, 22).padEnd(24)} giorno ${o.dayOfWeek} · ${o.closed ? 'CHIUSO' : `${o.openTime}-${o.closeTime}`}`);
console.log(`\neccezioni PER DATA di partner: ${eccPartner.length} · di valet: ${eccValet.length}`);
console.log(`⚠️ orari settimanali di VALET nel legacy: ${valetSettimanali} — in piattaforma il valet non ha un modello settimanale, restano fuori.`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }

let a = 0, b = 0, c = 0;
for (const o of orari) {
  const gia = await db.openingHour.findFirst({ where: { partnerId: o.partnerId, dayOfWeek: o.dayOfWeek } });
  const dati = { closed: o.closed, openTime: o.openTime, closeTime: o.closeTime };
  if (gia) await db.openingHour.update({ where: { id: gia.id }, data: dati });
  else await db.openingHour.create({ data: { partnerId: o.partnerId, dayOfWeek: o.dayOfWeek, ...dati } });
  a++;
}
for (const e of eccPartner) {
  await db.partnerDayException.upsert({
    where: { partnerId_date: { partnerId: e.partnerId, date: e.date } },
    update: { closed: e.closed, openTime: e.openTime, closeTime: e.closeTime, note: e.note },
    create: { partnerId: e.partnerId, date: e.date, closed: e.closed, openTime: e.openTime, closeTime: e.closeTime, note: e.note },
  });
  b++;
}
for (const e of eccValet) {
  await db.valetAvailability.upsert({
    where: { valetId_date: { valetId: e.valetId, date: e.date } },
    update: { available: e.available, timeFrom: e.timeFrom, timeTo: e.timeTo, note: e.note },
    create: { valetId: e.valetId, date: e.date, available: e.available, timeFrom: e.timeFrom, timeTo: e.timeTo, note: e.note },
  });
  c++;
}
console.log(`\n✅ orari settimanali ${a} · eccezioni partner ${b} · disponibilita valet ${c}`);
console.log('   OpeningHour ora:', await db.openingHour.count(), 'righe su', (await db.openingHour.findMany({ distinct: ['partnerId'], select: { partnerId: true } })).length, 'partner');
console.log('   PartnerDayException ora:', await db.partnerDayException.count());
await db.$disconnect();

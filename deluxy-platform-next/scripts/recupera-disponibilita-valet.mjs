/**
 * Recupera le disponibilita' dei valet che l'import aveva perso.
 *
 * ⚠️ Il modello aveva `@@unique([valetId, date])`: una disponibilita' sola per
 * valet al giorno. Nel legacy un valet ne ha fino a SEI, e 325 fasce distinte
 * non sono mai entrate — chi guardava vedeva «disponibile 16:00-18:00» dove in
 * realta' c'era anche «12:00-18:00». È lo stesso vincolo troppo stretto che
 * aveva gia' fatto perdere le finestre dei partner in `PartnerDayException`.
 *
 * Il vincolo ora comprende la fascia (migrazione
 * `20260825000000_disponibilita_valet_per_fascia`), e questo script rimette
 * dentro quello che mancava.
 *
 * ⚠️ I DOPPIONI VERI del legacy NON si ricopiano: 169 righe sono identiche
 * (stesso valet, stessa data, stessa fascia) — un valet ha sei volte la stessa
 * 18:00-21:30. Ricopiarle non aggiunge informazione, aggiunge rumore.
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

/** «16:00:00» → «16:00»: il modello tiene ore e minuti. */
const ora = (v) => {
  const t = String(v ?? '').trim();
  return /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : null;
};

const valet = new Map(
  (await db.valet.findMany({ where: { NOT: { legacyId: null } }, select: { id: true, legacyId: true } }))
    .map((v) => [String(v.legacyId), v.id]),
);

// Quello che c'e' gia', per chiave completa.
const presenti = new Set(
  (await db.valetAvailability.findMany({ select: { valetId: true, date: true, timeFrom: true, timeTo: true } }))
    .map((a) => `${a.valetId}|${a.date.toISOString().slice(0, 10)}|${a.timeFrom ?? ''}|${a.timeTo ?? ''}`),
);

const righe = leggiCsv(B + 'expert-time-availability.csv');
const daInserire = [];
const viste = new Set();
let doppioniLegacy = 0;
let senzaValet = 0;

for (const r of righe) {
  const valetId = valet.get(String(r.expertId));
  if (!valetId) { senzaValet++; continue; }
  const giorno = String(r.date).slice(0, 10);
  const timeFrom = ora(r.startTime);
  const timeTo = ora(r.endTime);
  const chiave = `${valetId}|${giorno}|${timeFrom ?? ''}|${timeTo ?? ''}`;
  if (viste.has(chiave)) { doppioniLegacy++; continue; }
  viste.add(chiave);
  if (presenti.has(chiave)) continue;
  daInserire.push({
    valetId,
    date: new Date(`${giorno}T00:00:00.000Z`),
    timeFrom,
    timeTo,
    available: String(r.available).trim() === '1',
  });
}

console.log(SCRIVI ? 'SCRITTURA' : 'PROVA A VUOTO — rilancia con --scrivi');
console.log(`righe nel legacy: ${righe.length.toLocaleString('it-IT')}`);
console.log(`  doppioni veri del legacy (non si ricopiano): ${doppioniLegacy}`);
console.log(`  senza un valet corrispondente: ${senzaValet}`);
console.log(`  gia' in banca dati: ${(viste.size - daInserire.length).toLocaleString('it-IT')}`);
console.log(`  ⭐ DA RECUPERARE: ${daInserire.length.toLocaleString('it-IT')}`);

if (daInserire.length) {
  const chiuse = daInserire.filter((d) => !d.available).length;
  console.log(`     di cui «non disponibile»: ${chiuse}`);
  console.log('     esempi:');
  for (const d of daInserire.slice(0, 4)) {
    console.log(`        ${d.date.toISOString().slice(0, 10)}  ${d.timeFrom}-${d.timeTo}  ${d.available ? 'disponibile' : 'chiuso'}`);
  }
}

if (!SCRIVI) { await db.$disconnect(); process.exit(0); }

let scritte = 0;
for (let i = 0; i < daInserire.length; i += 500) {
  const r = await db.valetAvailability.createMany({
    data: daInserire.slice(i, i + 500),
    skipDuplicates: true,
  });
  scritte += r.count;
}
console.log(`Recuperate: ${scritte.toLocaleString('it-IT')}`);
console.log(`Totale in tabella: ${(await db.valetAvailability.count()).toLocaleString('it-IT')}`);
await db.$disconnect();

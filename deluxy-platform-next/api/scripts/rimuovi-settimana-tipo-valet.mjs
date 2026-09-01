/**
 * RIMUOVE la «settimana tipo» dei valet (ValetOpeningHour): decisione utente
 * 01/09/2026 — quelle righe non le ha dichiarate nessuno, le aveva DEDOTTE
 * `semplifica-orari-google.mjs` prendendo la combinazione più frequente dallo
 * storico giorno-per-giorno. Nel tabellone si leggevano come «settimanale»,
 * cioè come un orario del valet: un'ipotesi vestita da dichiarazione.
 *
 * Restano intatte le dichiarazioni VERE (`ValetAvailability`: legacy + app) e
 * TUTTO il lato partner (OpeningHour serve allo smistamento, non si tocca).
 *
 * Reversibile: le righe si rigenerano identiche rilanciando
 * `scripts/semplifica-orari-google.mjs --scrivi` (derivazione deterministica);
 * in più il backup json scritto prima della cancellazione.
 *
 * Di default PROVA A VUOTO. Con --applica cancella.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();

const righe = await prisma.valetOpeningHour.findMany({
  include: { valet: { select: { firstName: true, lastName: true } } },
});
const nato = (id) => new Date(parseInt(id.slice(1, 9), 36));
const nonDelLotto = righe.filter((r) => nato(r.id).toISOString().slice(0, 10) !== '2026-08-24');

console.log(`ValetOpeningHour: ${righe.length} righe, su ${new Set(righe.map((r) => r.valetId)).size} valet.`);
console.log(`Nate FUORI dal lotto di derivazione del 24/08: ${nonDelLotto.length}`);
if (nonDelLotto.length) {
  // Una riga non del lotto sarebbe una dichiarazione vera: non si cancella al buio.
  for (const r of nonDelLotto) console.log('  ⚠️', r.valet.lastName, r.valet.firstName, 'giorno', r.dayOfWeek, 'nata', nato(r.id).toISOString());
  console.log('FERMO: righe non riconducibili alla derivazione. Decidere a mano.');
  await prisma.$disconnect();
  process.exit(1);
}

if (!APPLICA) {
  console.log('(prova a vuoto: rilanciare con --applica per cancellare)');
  await prisma.$disconnect();
  process.exit(0);
}

const backup = `C:/Users/nicol/AppData/Local/Temp/claude/backup-valet-opening-hour-${Date.now()}.json`;
fs.writeFileSync(backup, JSON.stringify(righe, null, 1));
console.log('Backup scritto:', backup);

const esito = await prisma.valetOpeningHour.deleteMany({});
console.log(`✅ cancellate ${esito.count} righe. Restano in tabella: ${await prisma.valetOpeningHour.count()}`);
await prisma.$disconnect();

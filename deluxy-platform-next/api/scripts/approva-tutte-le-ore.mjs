/**
 * Porta ad `approved` TUTTE le consegne rimaste in `delivered_time_to_approve`
 * (deciso dall'utente il 26/08/2026: «metti tutto approvato»).
 *
 * La corsa precedente — `approva-ore-gia-approvate.mjs` — aveva avanzato solo
 * le 283 con l'orario gia' approvato nel legacy (`approvedTimingStatus = 1`).
 * Queste sono le altre: 412 con `3` (in attesa) e 8 con `0` (nessun giro),
 * comprese consegne recentissime. Lo stipendio prende solo
 * `delivered | approved | not_delivered`: finche' restano qui non entrano in
 * nessuna busta.
 *
 * Sola lettura di default. `--applica` per scrivere; prima salva lo stato
 * vecchio in scripts/backup-420-approvate.json e lascia una riga di registro.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const APPLICA = process.argv.includes('--applica');
const QUI = path.dirname(fileURLToPath(import.meta.url));
const BACKUP = path.join(QUI, 'backup-420-approvate.json');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const eur = (n) => (n ?? 0).toFixed(2).replace('.', ',') + ' EUR';

const candidate = await db.delivery.findMany({
  where: { status: 'delivered_time_to_approve', deletedAt: null },
  select: { id: true, legacyId: true, date: true, status: true, approvedTimingStatus: true,
            valetSalary: true, paymentStatus: true, payable: true },
  orderBy: { date: 'asc' },
});
const perTiming = new Map();
for (const d of candidate) perTiming.set(d.approvedTimingStatus ?? '(vuoto)', (perTiming.get(d.approvedTimingStatus ?? '(vuoto)') ?? 0) + 1);

console.log(`\nConsegne ancora in 'delivered_time_to_approve': ${candidate.length}`);
console.log(`Paghe scritte che diventano pagabili: ${eur(candidate.reduce((s, d) => s + (d.valetSalary ?? 0), 0))}`);
console.log('approvedTimingStatus:', [...perTiming.entries()].map(([k, v]) => `${k}=${v}`).join(' · '));
console.log(`gia' pagate (paymentStatus=paid): ${candidate.filter((d) => d.paymentStatus === 'paid').length}`);
console.log(`non pagabili (payable=false): ${candidate.filter((d) => !d.payable).length}`);

if (!APPLICA) {
  console.log("\nPROVA A SECCO — niente e' stato scritto. Rilanciare con --applica.");
  await db.$disconnect();
  process.exit(0);
}

fs.writeFileSync(BACKUP, JSON.stringify(
  candidate.map((d) => ({ id: d.id, legacyId: d.legacyId, statusPrima: d.status, timing: d.approvedTimingStatus })), null, 2), 'utf8');
console.log(`\nBackup scritto in ${BACKUP} (${candidate.length} righe).`);

const MESSAGGIO = 'Stato portato ad «approvata» su decisione dell\'ufficio (26/08/2026): '
  + 'le ore in attesa di approvazione sono state approvate in blocco.';

let scritte = 0;
for (const d of candidate) {
  await db.$transaction([
    db.delivery.update({ where: { id: d.id }, data: { status: 'approved' } }),
    db.deliveryLog.create({ data: { deliveryId: d.id, type: 'status_change', message: MESSAGGIO } }),
  ]);
  scritte++;
  if (scritte % 100 === 0) console.log(`  ${scritte}/${candidate.length}…`);
}

const rimaste = await db.delivery.count({ where: { status: 'delivered_time_to_approve', deletedAt: null } });
const approvate = await db.delivery.count({ where: { status: 'approved', deletedAt: null } });
console.log(`\nScritte: ${scritte}. Rimaste in attesa: ${rimaste} (deve essere 0). Approvate adesso: ${approvate}.`);

await db.$disconnect();

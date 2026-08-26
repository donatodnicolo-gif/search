/**
 * Le consegne con l'ORARIO GIA' APPROVATO ma lo stato fermo a
 * `delivered_time_to_approve` vanno portate ad `approved` (deciso dall'utente
 * il 26/08/2026: «segna come approvate di default»).
 *
 * Perche' e' un problema e non una stranezza: lo stipendio prende solo
 * `delivered | approved | not_delivered` (salaries.module.ts) — finche' lo
 * stato resta `delivered_time_to_approve` quelle consegne NON entrano in
 * nessuna busta, anche se l'ora e' stata lavorata e approvata.
 *
 * `approvedTimingStatus` viene dal database originario (0 = nessun giro,
 * 1 = approvato, 3 = in attesa) e NON e' scritto da nessuna rotta della app
 * nuova: e' un'incoerenza ereditata dall'import, non una che si riproduce.
 *
 * Sola lettura di default. `--applica` per scrivere; prima salva lo stato
 * vecchio in scripts/backup-283-approvate.json (senza, non si puo' disfare)
 * e lascia una riga di registro su ogni consegna toccata.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const APPLICA = process.argv.includes('--applica');
const QUI = path.dirname(fileURLToPath(import.meta.url));
const BACKUP = path.join(QUI, 'backup-283-approvate.json');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const eur = (n) => (n ?? 0).toFixed(2).replace('.', ',') + ' EUR';

const candidate = await db.delivery.findMany({
  where: { status: 'delivered_time_to_approve', approvedTimingStatus: '1', deletedAt: null },
  select: {
    id: true, legacyId: true, date: true, status: true, hours: true, valetSalary: true,
    valetId: true, paymentStatus: true,
    valet: { select: { firstName: true, lastName: true } },
  },
  orderBy: { date: 'asc' },
});

const totale = candidate.reduce((s, d) => s + (d.valetSalary ?? 0), 0);
const gia = await db.delivery.count({ where: { status: 'approved', deletedAt: null } });
const restano = await db.delivery.count({
  where: { status: 'delivered_time_to_approve', deletedAt: null, NOT: { approvedTimingStatus: '1' } },
});

console.log(`\nConsegne da avanzare ad 'approved': ${candidate.length}`);
console.log(`Paghe scritte che diventano pagabili: ${eur(totale)}`);
console.log(`Gia' in 'approved' prima di questa corsa: ${gia}`);
console.log(`Restano in attesa (orario NON approvato, toccarle sarebbe un errore): ${restano}`);
const conPagamento = candidate.filter((d) => d.paymentStatus === 'paid');
if (conPagamento.length) console.log(`⚠️ ${conPagamento.length} risultano gia' pagate: si toccano lo stesso? Controllare prima.`);

if (!APPLICA) {
  console.log('\nPROVA A SECCO — niente e\' stato scritto. Rilanciare con --applica.');
  await db.$disconnect();
  process.exit(0);
}

fs.writeFileSync(BACKUP, JSON.stringify(
  candidate.map((d) => ({ id: d.id, legacyId: d.legacyId, statusPrima: d.status })), null, 2), 'utf8');
console.log(`\nBackup scritto in ${BACKUP} (${candidate.length} righe).`);

const MESSAGGIO = 'Stato portato ad «approvata»: le ore risultavano gia\' approvate '
  + '(approvedTimingStatus = 1) mentre lo stato era rimasto «da approvare» — '
  + 'incoerenza ereditata dal sistema originario, corretta il 26/08/2026.';

let scritte = 0;
for (const d of candidate) {
  await db.$transaction([
    db.delivery.update({ where: { id: d.id }, data: { status: 'approved' } }),
    db.deliveryLog.create({ data: { deliveryId: d.id, type: 'status_change', message: MESSAGGIO } }),
  ]);
  scritte++;
  if (scritte % 50 === 0) console.log(`  ${scritte}/${candidate.length}…`);
}

const rimaste = await db.delivery.count({
  where: { status: 'delivered_time_to_approve', approvedTimingStatus: '1', deletedAt: null },
});
const oraApprovate = await db.delivery.count({ where: { status: 'approved', deletedAt: null } });
console.log(`\nScritte: ${scritte}. Rimaste con l'incoerenza: ${rimaste} (deve essere 0).`);
console.log(`Consegne in 'approved' adesso: ${oraApprovate} (erano ${gia}).`);

await db.$disconnect();

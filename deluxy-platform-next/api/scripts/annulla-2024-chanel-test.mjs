/**
 * ANNULLA le consegne datate 2024 del partner «Chanel Test» (decisione utente
 * 02/09: «per il partner chanel test tutte le consegne 2024 vanno messe in
 * storico come annullate»).
 *
 * `cancelled` è uno stato CHIUSO (enums.ts): le consegne finiscono nello
 * Storico e — essendo non fatturabile — spariscono dal «da fatturare», che
 * per questo partner era intasato di residui legacy 2024.
 *
 * Si toccano solo le consegne NON già annullate; quelle con righe di fattura
 * o di stipendio si SALTANO e si elencano (annullarle sposterebbe conti già
 * scritti). Log su ogni consegna; prova a vuoto di default, con --applica
 * scrive (backup json completo prima).
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

const partner = await prisma.partner.findFirst({
  where: { insegna: 'Chanel Test' },
  select: { id: true, insegna: true },
});
if (!partner) { console.error('Partner «Chanel Test» non trovato: mi fermo.'); process.exit(1); }

const cons = await prisma.delivery.findMany({
  where: {
    partnerId: partner.id,
    deletedAt: null,
    date: { gte: new Date('2024-01-01'), lt: new Date('2025-01-01') },
    status: { not: 'cancelled' },
  },
  select: {
    id: true, code: true, date: true, status: true, invoiced: true,
    invoiceLines: { select: { id: true } },
    salaryLines: { select: { id: true } },
  },
  orderBy: { date: 'asc' },
});

const daFare = cons.filter((c) => !c.invoiceLines.length && !c.salaryLines.length);
const conConti = cons.filter((c) => c.invoiceLines.length || c.salaryLines.length);

const perStato = {};
for (const c of daFare) perStato[c.status] = (perStato[c.status] ?? 0) + 1;
console.log(`Partner: ${partner.insegna} (${partner.id})`);
console.log(`Consegne 2024 non annullate: ${cons.length} — da annullare: ${daFare.length}`, JSON.stringify(perStato));
for (const c of conConti) {
  console.log(`  ⚠️ #${c.code} (${c.date.toISOString().slice(0, 10)}, ${c.status}) ha righe di fattura/stipendio: SALTATA`);
}

if (!APPLICA) {
  for (const c of daFare) console.log(`  #${c.code} ${c.date.toISOString().slice(0, 10)} ${c.status} -> cancelled`);
  console.log('\nProva a vuoto: nessuna scrittura. Rilanciare con --applica.');
  process.exit(0);
}

const backupPath = `C:/Users/nicol/AppData/Local/Temp/claude/backup-annulla-2024-chanel-${Date.now()}.json`;
fs.writeFileSync(backupPath, JSON.stringify(cons, null, 1));
console.log(`Backup: ${backupPath}`);

let fatte = 0;
for (const c of daFare) {
  await prisma.delivery.update({
    where: { id: c.id },
    data: {
      status: 'cancelled',
      logs: { create: [{ type: 'status_change', message: `Annullata d'ufficio: pulizia dei residui 2024 di Chanel Test (decisione utente, 02/09/2026). Stato precedente: ${c.status}.` }] },
    },
  });
  fatte++;
}
console.log(`Annullate: ${fatte}/${daFare.length}. Saltate con conti: ${conConti.length}.`);
await prisma.$disconnect();

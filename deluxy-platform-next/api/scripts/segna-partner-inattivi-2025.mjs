/**
 * SEGNA INATTIVI (active=false, NON sospesi) i partner senza consegne
 * inserite dal 1/1/2025 (ordine utente 02/09: «segna tutti i partner che non
 * hanno inserito richieste da gennaio 2025 in stato inattivo»).
 *
 * Diverso da sospendi-inattivi-2025.mjs (che metteva deleted=true): qui solo
 * lo stato ATTIVO si spegne — il partner resta negli elenchi dell'ufficio e
 * si riaccende da lì. Chi è già Sospeso (deleted) è per definizione anche
 * inattivo: si riallinea active=false dove mancasse, senza toccare altro.
 *
 * Come la disattivazione dall'app (PartnersService.seguiLoStatoDelPartner),
 * i prodotti dei partner spenti vanno in archivio con motivo
 * «partner-disattivato»: riattivando il partner si ripescano solo quelli.
 * Anteprima di default; scrive con --applica (backup json prima).
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

const SOGLIA = new Date('2025-01-01T00:00:00.000Z');

// Chi ha inserito ALMENO una consegna (qualsiasi stato, non cancellata a DB)
// datata dal 2025 in poi resta com'è.
const conConsegne = new Set(
  (await prisma.delivery.groupBy({
    by: ['partnerId'],
    where: { deletedAt: null, date: { gte: SOGLIA } },
  })).map((x) => x.partnerId),
);

const daSpegnere = await prisma.partner.findMany({
  where: { deleted: false, active: true, id: { notIn: [...conConsegne] } },
  select: { id: true, insegna: true },
  orderBy: { insegna: 'asc' },
});
// Sospeso ⊃ inattivo (utente, 02/09): un deleted con active=true è incoerente.
const sospesiAttivi = await prisma.partner.findMany({
  where: { deleted: true, active: true },
  select: { id: true, insegna: true },
});

console.log(`Partner ATTIVI senza consegne dal 2025: ${daSpegnere.length}`);
for (const p of daSpegnere) console.log('  · ' + p.insegna);
console.log(`Sospesi ancora marcati attivi (da riallineare): ${sospesiAttivi.length}`);
for (const p of sospesiAttivi) console.log('  ⚠️ ' + p.insegna);

if (!APPLICA) {
  console.log('\nANTEPRIMA: niente scritto. Rilanciare con --applica.');
  await prisma.$disconnect();
  process.exit(0);
}

const backup = `C:/Users/nicol/AppData/Local/Temp/claude/backup-partner-inattivi-${Date.now()}.json`;
fs.writeFileSync(backup, JSON.stringify({ daSpegnere, sospesiAttivi }, null, 1));
console.log(`\nBackup: ${backup}`);

const ids = daSpegnere.map((p) => p.id);
const r1 = await prisma.partner.updateMany({ where: { id: { in: ids } }, data: { active: false } });
const r2 = await prisma.partner.updateMany({ where: { id: { in: sospesiAttivi.map((p) => p.id) } }, data: { active: false } });
// Prodotti in archivio col motivo, come fa l'app: la riattivazione li ripesca.
const rp = await prisma.product.updateMany({
  where: { partnerId: { in: ids }, archived: false },
  data: { archived: true, archivedAt: new Date(), archivedReason: 'partner-disattivato' },
});
console.log(`Spenti: ${r1.count} partner (+${r2.count} sospesi riallineati); prodotti archiviati: ${rp.count}.`);
await prisma.$disconnect();

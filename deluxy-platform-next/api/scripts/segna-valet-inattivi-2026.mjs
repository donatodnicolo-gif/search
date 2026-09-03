/**
 * SEGNA INATTIVI (active=false, NON sospesi) i VALET senza consegne nel 2026
 * (ordine utente 03/09) — specchio di segna-partner-inattivi-2025.
 * «Consegna fatta» = qualsiasi consegna non cancellata a DB con valetId suo
 * e data nel 2026, in qualunque stato. Riallinea anche gli eliminati rimasti
 * marcati attivi (sospeso ⊃ inattivo). Anteprima; scrive con --applica.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();
for (let t = 1; t <= 5; t++) {
  try { await prisma.$queryRaw`SELECT 1`; break; }
  catch (e) { if (t === 5) { console.error('DB irraggiungibile'); process.exit(1); } await new Promise((r) => setTimeout(r, 4000)); }
}

const conConsegne = new Set(
  (await prisma.delivery.groupBy({
    by: ['valetId'],
    where: { deletedAt: null, date: { gte: new Date('2026-01-01') }, valetId: { not: null } },
  })).map((x) => x.valetId),
);

const daSpegnere = await prisma.valet.findMany({
  where: { deleted: false, active: true, placeholder: false, id: { notIn: [...conConsegne] } },
  select: { id: true, firstName: true, lastName: true, isTeamLeader: true },
  orderBy: { lastName: 'asc' },
});
const sospesiAttivi = await prisma.valet.findMany({
  where: { deleted: true, active: true },
  select: { id: true, firstName: true, lastName: true },
});

console.log(`Valet ATTIVI senza consegne nel 2026: ${daSpegnere.length}`);
for (const v of daSpegnere) console.log('  ·', v.lastName, v.firstName, v.isTeamLeader ? '[TEAM LEADER]' : '');
console.log(`Eliminati ancora marcati attivi (da riallineare): ${sospesiAttivi.length}`);
for (const v of sospesiAttivi) console.log('  ⚠️', v.lastName, v.firstName);

if (!APPLICA) {
  console.log('\nANTEPRIMA: niente scritto. Rilanciare con --applica.');
  await prisma.$disconnect();
  process.exit(0);
}

fs.writeFileSync('C:/Users/nicol/AppData/Local/Temp/claude/backup-valet-inattivi-' + Date.now() + '.json',
  JSON.stringify({ daSpegnere, sospesiAttivi }, null, 1));
const r1 = await prisma.valet.updateMany({ where: { id: { in: daSpegnere.map((v) => v.id) } }, data: { active: false } });
const r2 = await prisma.valet.updateMany({ where: { id: { in: sospesiAttivi.map((v) => v.id) } }, data: { active: false } });
console.log(`\nSpenti: ${r1.count} valet (+${r2.count} eliminati riallineati). Backup salvato.`);
await prisma.$disconnect();

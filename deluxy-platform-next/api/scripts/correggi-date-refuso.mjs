/**
 * CORREGGE le tre date impossibili trovate il 01/09 (refusi del legacy,
 * decisione utente: «si sistema tutto così»):
 *   #27060 Wicuisine        29/11/2029 → 29/11/2024 (creata il 29/11/2024)
 *   #57975 Clivati-Consegne 19/05/2926 → 19/05/2026 (creata il 12/05/2026)
 *   #56163 Tiffany Corp.    15/07/2028 → 15/07/2026 (annullata: cosmetica)
 * Senza correzione le prime due restano nel «da fatturare» per sempre senza
 * mai comparire in un periodo. ⚠️ La #57975 ha la nota «PAGATO»: la data si
 * corregge, la questione se sia da fatturare resta APERTA (decisione utente).
 * Di default PROVA A VUOTO; con --applica scrive.
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

const PIANO = [
  { code: 27060, attesa: '2029-11-29', giusta: '2024-11-29', perche: 'creata il 29/11/2024: refuso d\u2019anno del legacy' },
  { code: 57975, attesa: '2926-05-19', giusta: '2026-05-19', perche: '2926 \u00e8 il 2026 con un tasto sbagliato (creata il 12/05/2026)' },
  { code: 56163, attesa: '2028-07-15', giusta: '2026-07-15', perche: 'refuso d\u2019anno del legacy (consegna annullata)' },
];
for (const p of PIANO) {
  const d = await prisma.delivery.findFirst({ where: { code: p.code }, select: { id: true, date: true, status: true } });
  if (!d) { console.log(`#${p.code}: NON TROVATA, salto`); continue; }
  const oggi = d.date.toISOString().slice(0, 10);
  if (oggi !== p.attesa) { console.log(`#${p.code}: la data è ${oggi}, non ${p.attesa} — già corretta o cambiata, salto`); continue; }
  console.log(`#${p.code} [${d.status}]: ${p.attesa} → ${p.giusta} (${p.perche})`);
  if (!APPLICA) continue;
  await prisma.delivery.update({ where: { id: d.id }, data: {
    date: new Date(`${p.giusta}T00:00:00.000Z`),
    logs: { create: [{ type: 'date_fix', message: `Data corretta: ${p.attesa} → ${p.giusta} — ${p.perche}. Pulizia refusi di data (utente, 01/09).` }] },
  } });
  console.log('  ✅ corretta');
}
if (!APPLICA) console.log('\n(prova a vuoto: rilanciare con --applica)');
await prisma.$disconnect();

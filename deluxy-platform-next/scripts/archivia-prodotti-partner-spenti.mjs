// I prodotti seguono il partner: se il partner e' disattivato, i suoi prodotti
// vanno in archivio.
//
// Regola decisa dall'utente il 24/08/2026. Da quel momento la applica il codice
// (`PartnersService.seguiLoStatoDelPartner`); questo script sistema il pregresso,
// cioe' i prodotti che la violavano gia'.
//
// Perche' conta: un prodotto di un partner spento non e' vendibile — non compare
// nel form consegna, non lo smista nessuno — ma restava nella lista principale
// come se lo fosse.
//
// ⚠️ Si scrive il MOTIVO (`archivedReason = 'partner-disattivato'`), e non e' un
// dettaglio: serve alla direzione opposta. Riattivando il partner si ripescano
// SOLO i prodotti finiti in archivio per causa sua, e non quelli che qualcuno
// aveva archiviato apposta. Senza quel segno, riattivare disferebbe la decisione
// di una persona.
//
// Di default non scrive. Con --scrivi applica.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const SCRIVI = process.argv.includes('--scrivi');
const MOTIVO = 'partner-disattivato';

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const daFare = await db.product.findMany({
  where: { partner: { active: false }, archived: false },
  select: { id: true, name: true, partner: { select: { insegna: true } } },
});
const perPartner = {};
for (const p of daFare) perPartner[p.partner.insegna] = (perPartner[p.partner.insegna] ?? 0) + 1;

console.log(`prodotti di partner disattivati ancora in lista: ${daFare.length}`);
console.log(`partner coinvolti: ${Object.keys(perPartner).length}\n`);
for (const [insegna, n] of Object.entries(perPartner).sort((a, b) => b[1] - a[1]).slice(0, 12))
  console.log(`   ${insegna.slice(0, 34).padEnd(36)} ${String(n).padStart(4)} prodotti`);

// I gia' archiviati NON si toccano: non si riscrive il motivo di una scelta
// che potrebbe essere stata di una persona.
const giaArchiviati = await db.product.count({ where: { partner: { active: false }, archived: true } });
console.log(`\n   gia' in archivio, lasciati come sono: ${giaArchiviati}`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }

const { count } = await db.product.updateMany({
  where: { id: { in: daFare.map((p) => p.id) } },
  data: { archived: true, archivedAt: new Date(), archivedReason: MOTIVO },
});
console.log(`\n✅ archiviati ${count}`);
console.log('   in lista principale ora:', await db.product.count({ where: { archived: false } }));
console.log('   in archivio:', await db.product.count({ where: { archived: true } }));
console.log('   di cui per partner disattivato:', await db.product.count({ where: { archivedReason: MOTIVO } }));
console.log('   ✅ prodotti di partner spenti rimasti in lista:',
  await db.product.count({ where: { partner: { active: false }, archived: false } }));
await db.$disconnect();

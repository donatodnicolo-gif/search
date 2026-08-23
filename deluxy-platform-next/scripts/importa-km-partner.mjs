// Importa i due campi dei km che sul PARTNER non erano mai stati portati:
//   kmIncluded          <- partner.kmIncluded          (267/267 erano null)
//   extraOutOfCityPrice <- partner.extraOutSideCityKmPrice
//
// Perche' erano rimasti fuori: nell'import c'era una riga
// `extraOutOfCityPrice: numero(e.extraOutSideCityKmPrice)` — ma `e` e' l'expert,
// cioe' il VALET. Il lato partner non l'aveva. Una `grep` per nome di campo
// trovava la riga e faceva credere che il lavoro fosse fatto: e' lo stesso
// errore del 23/08 sulla fee, cercare per nome invece che per soggetto.
//
// Contano: i km inclusi decidono da dove parte il conteggio dei km extra.
// A null l'extra rischia di partire dal chilometro zero.
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
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1` } } });

const legacy = Object.fromEntries(leggiCsv(B + 'partner.csv').map((p) => [p.id, p]));
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

const nostri = await db.partner.findMany({ select: { id: true, legacyId: true, insegna: true, kmIncluded: true, extraOutOfCityPrice: true } });
const cambi = [];
for (const p of nostri) {
  if (p.legacyId === null) continue;
  const l = legacy[String(p.legacyId)];
  if (!l) continue;
  const dati = {};
  const km = num(l.kmIncluded), ex = num(l.extraOutSideCityKmPrice);
  if (km !== null && km !== p.kmIncluded) dati.kmIncluded = km;
  if (ex !== null && ex !== p.extraOutOfCityPrice) dati.extraOutOfCityPrice = ex;
  if (Object.keys(dati).length) cambi.push({ p, dati });
}
console.log(`partner con legacyId: ${nostri.filter((p) => p.legacyId !== null).length}`);
console.log(`da aggiornare: ${cambi.length}`);
console.log(`  km inclusi da scrivere:            ${cambi.filter((c) => c.dati.kmIncluded !== undefined).length}`);
console.log(`  extra fuori citta da scrivere:     ${cambi.filter((c) => c.dati.extraOutOfCityPrice !== undefined).length}`);
console.log('\nprimi 10:');
for (const c of cambi.slice(0, 10)) console.log(`   ${c.p.insegna.slice(0, 30).padEnd(32)} ${JSON.stringify(c.dati)}`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }
let fatti = 0;
for (const c of cambi) { await db.partner.update({ where: { id: c.p.id }, data: c.dati }); fatti++; }
console.log(`\n✅ aggiornati ${fatti} partner`);
console.log('   ancora senza km inclusi:', await db.partner.count({ where: { kmIncluded: null } }));
console.log('   ancora senza extra fuori citta:', await db.partner.count({ where: { extraOutOfCityPrice: null } }));
await db.$disconnect();

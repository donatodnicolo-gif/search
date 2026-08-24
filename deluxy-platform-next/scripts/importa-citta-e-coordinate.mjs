// Citta' e coordinate di partner e valet: le ultime tre colonne del legacy che
// in piattaforma non avevano una casa.
//
// La citta' non e' ridondante: su 54 partner che ce l'hanno, 32 hanno un
// indirizzo che NON la contiene («BASARA · citta MILANO · indirizzo Corso
// Italia 6»). Buttarla avrebbe reso quegli indirizzi inutilizzabili.
//
// Le coordinate sono 188 partner e 179 valet gia' geocodificati: riusarle
// evita di richiamare Maps per indirizzi gia' risolti una volta.
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

const testo = (v) => { const s = (v ?? '').toString().trim(); return s && s !== 'NULL' && s !== 'NaN' ? s : null; };
/** Una coordinata a 0 non e' un luogo: e' il punto zero nel Golfo di Guinea. */
const coord = (v) => { const s = testo(v); if (s === null) return null;
  const n = Number(s); return Number.isFinite(n) && n !== 0 ? n : null; };

async function porta(nome, tabella, file, chiave) {
  const legacy = Object.fromEntries(leggiCsv(B + file).map((r) => [r.id, r]));
  const nostri = await tabella.findMany({ select: { id: true, legacyId: true, city: true, latitude: true, longitude: true, ...chiave } });
  const cambi = [];
  for (const x of nostri) {
    if (x.legacyId === null) continue;
    const l = legacy[String(x.legacyId)];
    if (!l) continue;
    const dati = {};
    const c = testo(l.city), la = coord(l.latitude), lo = coord(l.longitude);
    if (c !== null && c !== x.city) dati.city = c;
    if (la !== null && la !== x.latitude) dati.latitude = la;
    if (lo !== null && lo !== x.longitude) dati.longitude = lo;
    if (Object.keys(dati).length) cambi.push({ x, dati });
  }
  console.log(`${nome}: da aggiornare ${cambi.length}`);
  console.log(`   citta: ${cambi.filter((c) => c.dati.city !== undefined).length} · coordinate: ${cambi.filter((c) => c.dati.latitude !== undefined).length}`);
  if (!SCRIVI) return;
  for (const c of cambi) await tabella.update({ where: { id: c.x.id }, data: c.dati });
  console.log(`   ✅ scritti ${cambi.length}`);
}

await porta('PARTNER', db.partner, 'partner.csv', { insegna: true });
await porta('VALET  ', db.valet, 'expert.csv', { firstName: true });
if (!SCRIVI) console.log('\n(prova a vuoto: rilanciare con --scrivi)');
else {
  console.log('\nDOPO:');
  console.log('   partner con citta:', await db.partner.count({ where: { NOT: { city: null } } }),
              '· con coordinate:', await db.partner.count({ where: { NOT: { latitude: null } } }));
  console.log('   valet con citta:  ', await db.valet.count({ where: { NOT: { city: null } } }),
              '· con coordinate:', await db.valet.count({ where: { NOT: { latitude: null } } }));
}
await db.$disconnect();

// Rimette «super prodotto» dove deve stare: un flag suo, non un valore di `type`.
//
// Nel database originario `uniqueProduct` e `isSuperProduct` sono DUE colonne
// indipendenti. Nel primo import le ho fuse in un enum
// (UNICO | NON_UNICO | SUPERPRODOTTO), dove un prodotto non puo' essere unico
// E combinato allo stesso tempo. L'utente ha confermato il 24/08/2026 che sono
// separati: sono due domande diverse, CHI lo vende e COM'E' fatto.
//
// Oggi nessun prodotto e' entrambe le cose (0 su 21.909), quindi la fusione non
// ha ancora perso niente. Ma il modello sbagliato avrebbe reso quella
// combinazione impossibile da inserire, e nessuno avrebbe capito perche'.
//
// Cosa fa:
//   1. isSuperProduct <- la colonna vera del legacy;
//   2. i prodotti oggi type=SUPERPRODOTTO tornano al tipo che dice chi li
//      vende (UNICO se uniqueProduct=1, altrimenti NON_UNICO).
//
// ⚠️ Il punto 2 tocca lo SMISTAMENTO: un prodotto SUPERPRODOTTO oggi non entra
// nel ramo UNICO e finisce nella lista priorita'. Per i 9 del legacy e' anche
// il risultato giusto (hanno uniqueProduct=0), ma va detto invece che scoperto.
//
// Di default non scrive. Con --scrivi applica.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { leggiCsv } from './leggi-csv.mjs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const SCRIVI = process.argv.includes('--scrivi');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const legacy = Object.fromEntries(
  leggiCsv('C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle/product.csv')
    .map((p) => [p.id, { unico: p.uniqueProduct === '1', super: p.isSuperProduct === '1' }]));

const nostri = await db.product.findMany({ select: { id: true, legacyId: true, name: true, type: true, isSuperProduct: true } });
const cambi = [];
for (const p of nostri) {
  const l = p.legacyId !== null ? legacy[String(p.legacyId)] : null;
  const dati = {};
  // il flag: dal legacy dove c'e', se no dal tipo che avevo scritto io
  const superVero = l ? l.super : p.type === 'SUPERPRODOTTO';
  if (superVero !== p.isSuperProduct) dati.isSuperProduct = superVero;
  // il tipo torna a dire solo CHI lo vende
  if (p.type === 'SUPERPRODOTTO') {
    dati.type = l?.unico ? 'UNICO' : 'NON_UNICO';
  }
  if (Object.keys(dati).length) cambi.push({ p, dati });
}

console.log(`prodotti: ${nostri.length} · da aggiornare: ${cambi.length}`);
console.log(`   flag super da accendere: ${cambi.filter((c) => c.dati.isSuperProduct === true).length}`);
console.log(`   tipo da correggere:      ${cambi.filter((c) => c.dati.type).length}`);
for (const c of cambi.slice(0, 12))
  console.log(`   ${String(c.p.name).slice(0, 38).padEnd(40)} ${c.p.type} → ${JSON.stringify(c.dati)}`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }
for (const c of cambi) await db.product.update({ where: { id: c.p.id }, data: c.dati });
console.log(`\n✅ aggiornati ${cambi.length}`);
const g = await db.product.groupBy({ by: ['type'], _count: true });
console.log('   tipi ora:', g.map((x) => `${x.type} ${x._count}`).join(' · '));
console.log('   super prodotti:', await db.product.count({ where: { isSuperProduct: true } }));
console.log('   unici E super insieme:', await db.product.count({ where: { type: 'UNICO', isSuperProduct: true } }));
await db.$disconnect();

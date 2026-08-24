// Le ultime due colonne di `partner.csv` che erano rimaste fuori.
//
// 1) wooCommerceApiKey -> Partner.woocommerceApiKey (2 partner: CLIVATI-CONSEGNE
//    e Martesana ecommerce). Sono CREDENZIALI vere: `ck_` piu' 48 esadecimali,
//    le consumer key di WooCommerce. Nel database originario stavano in una
//    colonna di anagrafica come tutto il resto, e qui finiscono nella stessa —
//    ma insieme a questo import l'API ha smesso di restituirle (`PARTNER_OMIT`
//    in partners.service.ts), perche' un `findMany` con `include` le avrebbe
//    servite a chiunque sappia leggere i partner.
//
//    ⚠️ Questo script non stampa mai il valore: solo la lunghezza.
//
// 2) contractExpiryNotificationSent -> Partner.contractExpiryNotified (1 partner:
//    Angolo Fiorito, contratto fino al 16/06/2026). Dice che il vecchio sistema
//    aveva gia' mandato l'avviso di scadenza. Senza questo dato il nuovo
//    ambiente glielo rimanderebbe da capo.
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
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1` } } });

const testo = (v) => { const s = (v ?? '').toString().trim(); return s && s !== 'NULL' ? s : null; };
const legacy = Object.fromEntries(leggiCsv('C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle/partner.csv').map((p) => [p.id, p]));
const nostri = await db.partner.findMany({ select: { id: true, legacyId: true, insegna: true, woocommerceApiKey: true, contractExpiryNotified: true } });

const cambi = [];
for (const p of nostri) {
  if (p.legacyId === null) continue;
  const l = legacy[String(p.legacyId)];
  if (!l) continue;
  const dati = {};
  const chiave = testo(l.wooCommerceApiKey);
  if (chiave && chiave !== p.woocommerceApiKey) dati.woocommerceApiKey = chiave;
  const avvisato = l.contractExpiryNotificationSent === '1';
  if (avvisato && !p.contractExpiryNotified) dati.contractExpiryNotified = true;
  if (Object.keys(dati).length) cambi.push({ p, dati });
}

console.log(`da aggiornare: ${cambi.length}`);
for (const c of cambi) {
  const pezzi = [];
  // il valore della chiave non si stampa: solo che c'e' e quanto e' lunga
  if (c.dati.woocommerceApiKey) pezzi.push(`chiave WooCommerce (${c.dati.woocommerceApiKey.length} caratteri, non mostrata)`);
  if (c.dati.contractExpiryNotified) pezzi.push('avviso di scadenza gia\' mandato');
  console.log(`   ${c.p.insegna.slice(0, 28).padEnd(30)} ${pezzi.join(' · ')}`);
}

// La colonna e' @unique: due partner con la stessa chiave farebbero fallire tutto.
const chiavi = cambi.map((c) => c.dati.woocommerceApiKey).filter(Boolean);
if (new Set(chiavi).size !== chiavi.length) { console.log('\n🔴 due partner hanno la STESSA chiave: la colonna e\' unique, mi fermo.'); await db.$disconnect(); process.exit(1); }

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }
for (const c of cambi) await db.partner.update({ where: { id: c.p.id }, data: c.dati });
console.log(`\n✅ aggiornati ${cambi.length} partner`);
console.log('   con chiave WooCommerce:', await db.partner.count({ where: { NOT: { woocommerceApiKey: null } } }));
console.log('   gia\' avvisati della scadenza:', await db.partner.count({ where: { contractExpiryNotified: true } }));
await db.$disconnect();

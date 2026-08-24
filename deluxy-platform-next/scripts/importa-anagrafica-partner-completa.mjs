// Importa TUTTI i campi anagrafici, fiscali e bancari dei partner che erano
// rimasti indietro. Il modello li aveva gia' quasi tutti: erano semplicemente
// non scritti.
//
// ⭐ Il piu' importante e' `agency` -> `businessName`. Nel legacy la RAGIONE
// SOCIALE si chiama `agency` («BEYOND 142 SRL», «BASARA MILANO ITALIA SRL»),
// mentre `businessName` e' l'INSEGNA. Nel primo import avevo preso
// businessName -> businessName: e' per questo che 265 partner su 267 avevano la
// ragione sociale identica all'insegna, e per questo «beyond» non si trovava.
// Il dato c'era da sempre, sotto un nome che non sembrava quello.
//
// Le date arrivano come "2025-12-31" e vanno lette a mezzogiorno UTC, se no il
// fuso puo' spostarle al giorno prima.
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

const testo = (v) => { const s = (v ?? '').toString().trim(); return s && s !== 'NULL' && s !== 'NaN' ? s : null; };
const bool = (v) => (v === '1' || v === 1 || v === 'true' ? true : v === '0' || v === 0 || v === 'false' ? false : null);
const giorno = (v) => { const s = testo(v); if (!s) return null;
  const d = new Date(`${s.slice(0, 10)}T12:00:00.000Z`); return isNaN(d.getTime()) ? null : d; };
/** IBAN scritto a gruppi: gli spazi non fanno parte del codice. */
const iban = (v) => { const s = testo(v); return s ? s.replace(/\s+/g, '').toUpperCase() : null; };

const CAMPI = [
  // [colonna legacy, campo piattaforma, come si legge]
  ['agency', 'businessName', testo],
  ['billingEmail', 'invoiceEmail', testo],
  ['billingAccess', 'invoicingEnabled', bool],
  ['bankAccount', 'bankAccount', iban],
  ['bankAccountName', 'bankAccountName', testo],
  ['sdiCode', 'sdiCode', testo],
  ['certifiedEmail', 'certifiedEmail', testo],
  ['partnerPaymentMethod', 'paymentMethod', testo],
  ['partnerPaymentStatus', 'paymentStatus', testo],
  ['startContractDate', 'contractStart', giorno],
  ['endContractDate', 'contractEnd', giorno],
  ['activityReminder', 'activityReminder', bool],
  ['sendSms', 'smsTemplatesEnabled', bool],
  ['receiveEmailMsg', 'mailNotifications', bool],
  ['receiveWhatsappMsg', 'whatsappNotifications', bool],
  ['isMultiplePickUpAddress', 'isMultiPickup', bool],
  ['pickupAddresses', 'pickupAddresses', testo],
  ['partnerShopUrl', 'storeUrl', testo],
  ['saleImage', 'imageUrl', testo],
  ['checkExpertIndentity', 'valetIdentityCheck', bool],
  // wooCommerceApiKey NON si importa: e' una credenziale, e sono 2 record.
  //   Se serve, va messa dove stanno i segreti, non in una colonna di anagrafica.
];

const legacy = Object.fromEntries(leggiCsv('C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle/partner.csv').map((p) => [p.id, p]));
const nostri = await db.partner.findMany();

const conta = {};
const cambi = [];
for (const p of nostri) {
  if (p.legacyId === null) continue;
  const l = legacy[String(p.legacyId)];
  if (!l) continue;
  const dati = {};
  for (const [colonna, campo, leggi] of CAMPI) {
    const v = leggi(l[colonna]);
    if (v === null) continue;                       // un vuoto non sovrascrive mai
    const attuale = p[campo] instanceof Date ? p[campo].toISOString().slice(0, 10) : p[campo];
    const nuovo = v instanceof Date ? v.toISOString().slice(0, 10) : v;
    if (attuale === nuovo) continue;
    dati[campo] = v;
    conta[campo] = (conta[campo] ?? 0) + 1;
  }
  if (Object.keys(dati).length) cambi.push({ p, dati });
}

console.log(`partner da aggiornare: ${cambi.length}\n`);
console.log('CAMPO'.padEnd(24) + 'da scrivere');
for (const [k, v] of Object.entries(conta).sort((a, b) => b[1] - a[1])) console.log('  ' + k.padEnd(22) + String(v).padStart(5));
console.log('\nesempio (142 RESTAURANT):');
const c142 = cambi.find((c) => c.p.insegna.includes('142 REST'));
if (c142) for (const [k, v] of Object.entries(c142.dati)) console.log(`   ${k.padEnd(22)} ${v instanceof Date ? v.toISOString().slice(0, 10) : JSON.stringify(v)}`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }
let fatti = 0;
for (const c of cambi) { await db.partner.update({ where: { id: c.p.id }, data: c.dati }); fatti++; }
console.log(`\n✅ aggiornati ${fatti} partner`);
const q = async (campo) => db.partner.count({ where: { NOT: { [campo]: null } } });
console.log('   con IBAN:', await q('bankAccount'), '· con codice SDI:', await q('sdiCode'), '· con PEC:', await q('certifiedEmail'));
console.log('   con email di fatturazione:', await q('invoiceEmail'), '· con inizio contratto:', await q('contractStart'));
const diversi = await db.$queryRawUnsafe('select count(*)::int as n from "platform"."Partner" where "businessName" is not null and lower(trim("businessName")) <> lower(trim(insegna))');
console.log('   ragione sociale DIVERSA dall insegna:', diversi[0].n, '(prima erano 2)');
await db.$disconnect();

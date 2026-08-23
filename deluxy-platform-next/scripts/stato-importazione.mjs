// Fotografia onesta di che cosa e' stato importato e che cosa no.
//
// Confronta le righe di ogni tabella del legacy (in legacy/tabelle/) con quelle
// presenti nel database nuovo, e dice per ognuna: fatta, parziale, da fare, o
// senza destinazione nello schema.
//
// Uso:  node C:/Users/nicol/app/deluxy-platform-next/scripts/stato-importazione.mjs

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const TABELLE = 'C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle';

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;
const db = new PrismaClient();

/** tabella legacy -> [modello nuovo, nota]. `null` = nessuna destinazione. */
const DESTINAZIONE = {
  provinces: ['province'], 'province-cities': ['city'],
  user: ['user'], customer: ['customer'], partner: ['partner'],
  expert: ['valet'], operation: ['operation'],
  service: ['serviceType'], 'tabella-38': ['serviceType', 'catalogo servizi valet'],
  'partner-service': ['partnerService'], 'expert-service': ['valetService'],
  'delivery-rules': ['deliveryRule'], 'tabella-34': ['valetDeliveryRule'],
  'tabella-89': ['partnerProvince', 'province di partner e valet'],
  'tabella-57': ['partnerCategory'],
  'product-category': ['category'], product: ['product'], 'products-variants': ['productVariant'],
  delivery: ['delivery'], 'delivery-product': ['deliveryProduct'],
  'valet-activities': ['activity'], 'delivery-updates': ['deliveryLog'],
  'expert-receipts': ['receipt'], 'delivery-invoices': ['invoice'],
  'expert-time-availability': ['valetAvailability'],
  'partner-time-availability': ['partnerDayException'],
  'refund-requests': ['payment'],
  // Senza destinazione nel nuovo schema:
  'delivery-complaint': null, 'email-template': null, 'emails-webhook': null,
  'shop-collection': null, 'stripe-customer': null, 'stripe-card': null,
  'custom-payments': null, offer: null, 'partner-invoice': null,
  'partner-reminder': null, 'web-push-subscription': null, 'web-push-history': null,
  'expert-contracts': null, 'expert-vehicle': null, 'team-leader-province': null,
  'product-category-province-discount': null,
};

/** Conta le righe di un CSV senza caricarlo in memoria. */
async function righeCsv(file) {
  const flusso = fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 });
  let n = 0, inStr = false, chiusa = false, qualcosa = false;
  for await (const p of flusso) {
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (chiusa) { chiusa = false; if (c === '"') continue; inStr = false; }
      if (inStr) { if (c === '"') chiusa = true; continue; }
      if (c === '"') { inStr = true; qualcosa = true; continue; }
      if (c === '\n') { n++; qualcosa = false; continue; }
      if (c !== '\r') qualcosa = true;
    }
  }
  if (qualcosa) n++;
  return Math.max(0, n - 1); // meno l'intestazione
}

const file = fs.readdirSync(TABELLE).filter((f) => f.endsWith('.csv'));
const fatte = [], parziali = [], daFare = [], senzaDestinazione = [], ignote = [];

for (const f of file) {
  const nome = path.basename(f, '.csv');
  const legacy = await righeCsv(path.join(TABELLE, f));
  if (!(nome in DESTINAZIONE)) { ignote.push([nome, legacy]); continue; }
  const dest = DESTINAZIONE[nome];
  if (!dest) { senzaDestinazione.push([nome, legacy]); continue; }
  const [modello, nota] = dest;
  let n = 0;
  try { n = await db[modello].count(); } catch { n = -1; }
  const voce = [nome, legacy, modello, n, nota];
  if (n <= 0) daFare.push(voce);
  else if (n >= legacy * 0.95) fatte.push(voce);
  else parziali.push(voce);
}

const stampa = (titolo, righe, conNumeri = true) => {
  console.log(`\n${titolo} (${righe.length})`);
  for (const r of righe) {
    if (!conNumeri) { console.log(`   ${String(r[0]).padEnd(34)} ${String(r[1]).padStart(7)} righe`); continue; }
    const [nome, legacy, modello, n, nota] = r;
    console.log(`   ${nome.padEnd(30)} legacy ${String(legacy).padStart(7)} → ${modello}: ${String(n).padStart(7)}${nota ? '  (' + nota + ')' : ''}`);
  }
};

console.log('STATO DELL\'IMPORTAZIONE\n' + '='.repeat(78));
stampa('✅ IMPORTATE', fatte);
stampa('🟡 PARZIALI (nel database ce ne sono meno)', parziali);
stampa('🔴 DA FARE', daFare);
stampa('⚪ SENZA DESTINAZIONE nel nuovo schema', senzaDestinazione, false);
if (ignote.length) stampa('❓ NON CLASSIFICATE', ignote, false);

const somma = (a) => a.reduce((s, r) => s + r[1], 0);
console.log('\n' + '='.repeat(78));
console.log(`righe legacy importate: ${(somma(fatte) + somma(parziali)).toLocaleString('it-IT')}`);
console.log(`righe legacy ancora da importare: ${somma(daFare).toLocaleString('it-IT')}`);
console.log(`righe senza destinazione: ${somma(senzaDestinazione).toLocaleString('it-IT')}`);
await db.$disconnect();

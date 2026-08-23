// Riconcilia le consegne importate col database originario, campo per campo.
//
// Non si fida dell'import: rilegge il CSV del legacy, rilegge il database, e
// confronta ogni consegna per `legacyId`. Serve a rispondere a «i dati dentro
// ogni consegna sono giusti?» contando, non a memoria.
//
// Riporta, per ogni campo, quante consegne NON combaciano e alcuni esempi.
//
// Uso:  node C:/Users/nicol/app/deluxy-platform-next/scripts/verifica-consegne-importate.mjs

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const CSV = 'C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle/delivery.csv';

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;
const db = new PrismaClient();

// --- stesse conversioni dell'import: se qui divergessero, il confronto mentirebbe
const testo = (v) => { if (v == null) return null; const t = String(v).trim(); return t === '' || t === 'NULL' ? null : t; };
const numero = (v) => { const t = testo(v); if (t === null) return null; const n = Number(t); return Number.isNaN(n) ? null : n; };
const intero = (v) => { const n = numero(v); return n === null ? null : Math.trunc(n); };
const bool = (v) => { const t = testo(v); return t === null ? null : t === '1' || t.toLowerCase() === 'true'; };
const giorno = (v) => { const t = testo(v); return !t || t.startsWith('0000-00-00') ? null : t.slice(0, 10); };
const ora = (v) => testo(v)?.slice(0, 5) ?? null;

const STATO = {
  created: 'created', assigned: 'assigned', accepted: 'accepted', delivering: 'in_delivery',
  delivered: 'delivered', notDelivered: 'not_delivered', canceled: 'cancelled',
  requestCancellation: 'cancellation_requested', notAccepted: 'not_accepted',
  deliveredWithTimeToBeApproved: 'delivered_time_to_approve', approved: 'approved',
  invalidated: 'invalidated',
};

console.log('Carico le consegne dal database…');
const perLegacy = new Map();
const CAMPI = {
  legacyId: true, code: true, date: true, status: true,
  recipientFirstName: true, recipientLastName: true, recipientAddress: true,
  recipientPhone: true, recipientEmail: true, recipientIntercom: true,
  senderFirstName: true, senderLastName: true, senderPhone: true,
  deliveryTimeFrom: true, deliveryTimeTo: true, pickupAddress: true,
  price: true, additionalPrice: true, valetSalary: true, valetAdditionalPrice: true,
  billable: true, payable: true, notes: true, internalNotes: true,
  ddtNumber: true, ddtFile: true, identifier: true, productValue: true,
  paymentStatus: true, distanceKm: true, hours: true, deliveredAt: true,
  startedAt: true, receipt: true, productManagement: true, deletedAt: true,
  partner: { select: { legacyId: true } },
  valet: { select: { legacyId: true } },
  serviceType: { select: { legacyId: true } },
};
let letti = 0;
for (let salta = 0; ; salta += 5000) {
  const blocco = await db.delivery.findMany({
    where: { legacyId: { not: null } }, select: CAMPI, skip: salta, take: 5000,
    orderBy: { legacyId: 'asc' },
  });
  if (!blocco.length) break;
  for (const d of blocco) perLegacy.set(d.legacyId, d);
  letti += blocco.length;
  process.stdout.write(`\r  ${letti}`);
}
console.log(`\nnel database: ${perLegacy.size} consegne con legacyId\n`);

// --- confronto campo per campo -------------------------------------------
const differenze = {}, esempi = {};
const segnala = (campo, legacyId, atteso, trovato) => {
  differenze[campo] = (differenze[campo] ?? 0) + 1;
  (esempi[campo] ??= []).length < 3 && esempi[campo].push(`#${legacyId}: legacy=${JSON.stringify(atteso)} db=${JSON.stringify(trovato)}`);
};
const cfr = (campo, legacyId, atteso, trovato) => {
  const a = atteso ?? null, b = trovato ?? null;
  if (a === null && b === null) return;
  if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > 0.005) segnala(campo, legacyId, a, b); return; }
  if (String(a) !== String(b)) segnala(campo, legacyId, a, b);
};

let righe = 0, mancanti = 0, saltateAttese = 0;
const mancantiEsempi = [];

await perRigaCsv(CSV, (r) => {
  righe++;
  const legacyId = intero(r.id);
  const d = perLegacy.get(legacyId);
  if (!d) {
    // Le esclusioni decise: senza data o senza partner. Sono attese.
    if (!giorno(r.deliveryDate) || !testo(r.partnerId)) { saltateAttese++; return; }
    mancanti++;
    if (mancantiEsempi.length < 5) mancantiEsempi.push(`#${legacyId} (data ${giorno(r.deliveryDate)}, partner ${testo(r.partnerId)})`);
    return;
  }
  cfr('code', legacyId, legacyId, d.code);
  cfr('date', legacyId, giorno(r.deliveryDate), d.date && d.date.toISOString().slice(0, 10));
  cfr('status', legacyId, STATO[testo(r.status)] ?? 'created', d.status);
  cfr('partner', legacyId, intero(r.partnerId), d.partner?.legacyId);
  cfr('valet', legacyId, intero(r.expertId), d.valet?.legacyId);
  cfr('destinatario.nome', legacyId, testo(r.name) ?? 'Non indicato', d.recipientFirstName);
  cfr('destinatario.cognome', legacyId, testo(r.surname) ?? 'Non indicato', d.recipientLastName);
  cfr('destinatario.indirizzo', legacyId, testo(r.address) ?? 'Non indicato', d.recipientAddress);
  cfr('destinatario.telefono', legacyId, testo(r.receiverPhone), d.recipientPhone);
  cfr('destinatario.email', legacyId, testo(r.email), d.recipientEmail);
  cfr('destinatario.citofono', legacyId, testo(r.intercom), d.recipientIntercom);
  cfr('mittente.nome', legacyId, testo(r.senderName), d.senderFirstName);
  cfr('mittente.cognome', legacyId, testo(r.senderSurname), d.senderLastName);
  cfr('mittente.telefono', legacyId, testo(r.senderPhone), d.senderPhone);
  cfr('fascia.dalle', legacyId, ora(r.fromTime), d.deliveryTimeFrom);
  cfr('fascia.alle', legacyId, ora(r.toTime), d.deliveryTimeTo);
  cfr('indirizzoRitiro', legacyId, testo(r.pickUpAddress), d.pickupAddress);
  cfr('prezzo', legacyId, numero(r.price), d.price);
  cfr('prezzo.plus', legacyId, numero(r.additionalPrice), d.additionalPrice);
  cfr('paga.valet', legacyId, numero(r.expertSalary), d.valetSalary);
  cfr('paga.plus', legacyId, numero(r.valetAdditionalPrice), d.valetAdditionalPrice);
  cfr('daFatturare', legacyId, bool(r.billable) ?? true, d.billable);
  cfr('daPagare', legacyId, bool(r.payable) ?? true, d.payable);
  cfr('note', legacyId, testo(r.notes), d.notes);
  cfr('noteInterne', legacyId, testo(r.internalNotes), d.internalNotes);
  cfr('ddt.numero', legacyId, testo(r.ddtNumber), d.ddtNumber);
  cfr('ddt.file', legacyId, testo(r.ddtFile), d.ddtFile);
  cfr('identifier', legacyId, testo(r.identifier), d.identifier);
  cfr('valoreMerce', legacyId, numero(r.productValue), d.productValue);
  cfr('statoPagamento', legacyId, testo(r.paymentStatus) ?? 'default', d.paymentStatus);
  cfr('distanza', legacyId, numero(r.distance), d.distanceKm);
  cfr('ore', legacyId, numero(r.hours), d.hours);
  cfr('ricevuta', legacyId, testo(r.receipt), d.receipt);
  cfr('destinoMerce', legacyId, testo(r.productManagement), d.productManagement);
  cfr('servizio', legacyId, intero(r.service), d.serviceType?.legacyId ?? null);
});

console.log(`righe nel CSV: ${righe}`);
console.log(`saltate come previsto (senza data o senza partner): ${saltateAttese}`);
console.log(`🔴 ATTESE NEL DATABASE MA ASSENTI: ${mancanti}`);
mancantiEsempi.forEach((x) => console.log('   ' + x));

const nomi = Object.keys(differenze).sort((a, b) => differenze[b] - differenze[a]);
console.log(`\nCAMPI CONFRONTATI: 35 · con almeno una differenza: ${nomi.length}\n`);
if (!nomi.length) console.log('✅ nessuna differenza: ogni consegna combacia col legacy.');
for (const c of nomi) {
  console.log(`  ${c.padEnd(24)} ${String(differenze[c]).padStart(7)} consegne`);
  esempi[c].forEach((e) => console.log(`      ${e}`));
}
await db.$disconnect();

/** Legge un CSV in streaming rispettando virgolette e a capo nei campi. */
async function perRigaCsv(file, onRiga) {
  const flusso = fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 });
  let testa = null, campi = [], campo = '', inStr = false, chiusa = false;
  const rec = (r) => {
    if (!testa) { testa = r.map((x) => x.trim()); return; }
    onRiga(Object.fromEntries(testa.map((c, i) => [c, r[i]])));
  };
  for await (const pezzo of flusso) {
    for (let i = 0; i < pezzo.length; i++) {
      const c = pezzo[i];
      if (chiusa) { chiusa = false; if (c === '"') { campo += '"'; continue; } inStr = false; }
      if (inStr) { if (c === '"') { chiusa = true; continue; } campo += c; continue; }
      if (c === '"') { inStr = true; continue; }
      if (c === ',') { campi.push(campo); campo = ''; continue; }
      if (c === '\n') { campi.push(campo); rec(campi); campi = []; campo = ''; continue; }
      if (c === '\r') continue;
      campo += c;
    }
  }
  if (campo !== '' || campi.length) { campi.push(campo); rec(campi); }
}

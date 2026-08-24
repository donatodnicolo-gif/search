// Importa le FATTURE del database originario: 559 fatture e 9.811 righe.
//
// Nel legacy la fattura sta in tre pezzi che nessuno aveva ancora messo
// insieme: `delivery-invoices` (la fattura: stato, importo, PDF, pagamento
// Stripe), `tabella-21` (il pivot: quali consegne stanno in quale fattura, col
// partner) e `partner-invoice`.
//
// COSA SI RICAVA E COSA NO:
//  - il PARTNER viene dal pivot, non dalla fattura: e' li' che sta scritto;
//  - il PERIODO non esiste nel legacy, si ricava dalle date delle consegne
//    dentro la fattura (prima e ultima). E' una deduzione, ma di quelle
//    innocue: sono le date vere delle righe, non una stima;
//  - il NUMERO non esiste: si usa `FAT-LEGACY-<id>`, che dice da dove viene
//    invece di fingere una numerazione nostra;
//  - le RIGHE portano data, destinatario e importo della consegna: la fattura
//    e' una fotografia, come la riga di consegna. Se un giorno la consegna
//    cambia, la fattura emessa non deve cambiare con lei.
//
// 🔴 L'IMPORTO DICHIARATO NON TORNA COI CONTI, E NON SI CORREGGE.
//
// 291 fatture su 559 hanno `invoiceAmount` a ZERO pur avendo decine di righe
// (Angolo Fiorito: 37 consegne, importo 0). E su 532 su 559 il dichiarato non
// coincide con la somma delle righe: 131.850 EUR contro 180.083 EUR.
//
// Si importa il DICHIARATO, non il calcolato. La fattura e' un documento
// emesso e pagato: quel numero e' un fatto, la somma delle righe e' una
// ricostruzione fatta oggi su prezzi che intanto possono essere cambiati.
// Sovrascrivere il fatto con la ricostruzione vorrebbe dire riscrivere 559
// documenti gia' incassati, in silenzio.
//
// Il conteggio delle consegne viaggia insieme all'importo: cosi' una fattura
// da 0 EUR con 37 righe si vede che e' strana, invece di sembrare normale.
//
// ⚠️ Tutte e 559 risultano `paid`. Entrano quindi come PAGATE e ARCHIVIATE:
// metterle in bozza le farebbe comparire fra le cose da fare, e sono chiuse
// da mesi.
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
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const fatture = leggiCsv(B + 'delivery-invoices.csv').filter((r) => !r.deletedAt);
const pivot = leggiCsv(B + 'tabella-21.csv');

const partner = new Map((await db.partner.findMany({ where: { NOT: { legacyId: null } }, select: { id: true, legacyId: true, insegna: true } })).map((p) => [String(p.legacyId), p]));
const consegne = new Map((await db.delivery.findMany({
  where: { NOT: { legacyId: null } },
  select: { id: true, legacyId: true, date: true, recipientFirstName: true, recipientLastName: true, recipientAddress: true, price: true, additionalPrice: true },
})).map((d) => [String(d.legacyId), d]));

const perFattura = new Map();
for (const r of pivot) {
  if (!perFattura.has(r.deliveryInvoiceId)) perFattura.set(r.deliveryInvoiceId, []);
  perFattura.get(r.deliveryInvoiceId).push(r);
}

const numero = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const piano = [];
const saltate = { senzaRighe: 0, senzaPartner: 0 };
let righeSenzaConsegna = 0;

for (const f of fatture) {
  const righe = perFattura.get(f.id) ?? [];
  if (!righe.length) { saltate.senzaRighe++; continue; }
  // Il partner sta sul pivot: si prende quello della prima riga che ce l'ha.
  const idPartnerLegacy = righe.find((r) => r.partnerId)?.partnerId;
  const p = idPartnerLegacy ? partner.get(String(idPartnerLegacy)) : null;
  if (!p) { saltate.senzaPartner++; continue; }

  const linee = [];
  for (const r of righe) {
    const c = consegne.get(String(r.deliveryId));
    if (!c) { righeSenzaConsegna++; continue; }
    linee.push({
      deliveryId: c.id,
      date: c.date,
      recipient: [c.recipientLastName, c.recipientFirstName].filter(Boolean).join(' ') || '—',
      description: c.recipientAddress ?? null,
      amount: (c.price ?? 0) + (c.additionalPrice ?? 0),
    });
  }
  const date = linee.map((l) => l.date).filter(Boolean).sort((a, b) => a - b);
  const emessa = f.createdAt ? new Date(String(f.createdAt).replace(' ', 'T') + 'Z') : null;
  piano.push({
    legacyId: numero(f.id),
    partnerId: p.id,
    insegna: p.insegna,
    number: `FAT-LEGACY-${f.id}`,
    // Il periodo dalle date vere delle righe; se mancano, il giorno della fattura.
    periodStart: date[0] ?? emessa ?? new Date(),
    periodEnd: date[date.length - 1] ?? emessa ?? new Date(),
    totalAmount: numero(f.invoiceAmount),
    deliveriesCount: linee.length,
    status: 'PAID',
    archived: true,
    issuedAt: emessa,
    paidAt: f.updatedAt ? new Date(String(f.updatedAt).replace(' ', 'T') + 'Z') : emessa,
    documentUrl: f.invoiceUrl && f.invoiceUrl !== 'NULL' ? f.invoiceUrl : null,
    paymentIntentId: f.paymentIntentId && f.paymentIntentId !== 'NULL' ? f.paymentIntentId : null,
    linee,
  });
}

const totale = piano.reduce((s, x) => s + x.totalAmount, 0);
console.log(`fatture nel legacy: ${fatture.length} · righe pivot: ${pivot.length}`);
console.log(`🔵 importabili: ${piano.length} · righe: ${piano.reduce((s, x) => s + x.linee.length, 0)}`);
console.log(`   saltate — senza righe: ${saltate.senzaRighe} · senza partner riconosciuto: ${saltate.senzaPartner}`);
console.log(`   righe la cui consegna non e' in piattaforma: ${righeSenzaConsegna}`);
console.log(`   importo totale: ${totale.toLocaleString('it-IT', { maximumFractionDigits: 0 })} EUR`);
console.log('\nprime 6:');
for (const x of piano.slice(0, 6))
  console.log(`   ${x.number.padEnd(18)}${x.insegna.slice(0, 24).padEnd(26)}${String(x.deliveriesCount).padStart(4)} consegne · ${x.totalAmount.toFixed(2)} EUR · ${x.periodStart.toISOString().slice(0, 10)} → ${x.periodEnd.toISOString().slice(0, 10)}`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }

let fatte = 0;
for (const x of piano) {
  const { linee, insegna, ...dati } = x;
  const esistente = await db.invoice.findUnique({ where: { legacyId: dati.legacyId } });
  if (esistente) {
    await db.invoice.update({ where: { id: esistente.id }, data: { ...dati, lines: { deleteMany: {}, create: linee } } });
  } else {
    await db.invoice.create({ data: { ...dati, lines: { create: linee } } });
  }
  fatte++;
  if (fatte % 100 === 0) console.log(`   … ${fatte}/${piano.length}`);
}
console.log(`\n✅ fatture ${fatte}`);
console.log('   in piattaforma:', await db.invoice.count(), 'fatture ·', await db.invoiceLine.count(), 'righe');
const somma = await db.invoice.aggregate({ _sum: { totalAmount: true } });
console.log('   importo totale:', Math.round(somma._sum.totalAmount ?? 0).toLocaleString('it-IT'), 'EUR');
await db.$disconnect();

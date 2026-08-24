/**
 * Rimette in ordine i totali delle 559 fatture storiche.
 *
 * Il legacy teneva un solo numero, `invoiceAmount`, e l'import lo aveva copiato
 * dentro `totalAmount`. Due cose non tornavano:
 *
 *  1. 291 fatture su 559 uscivano a 0 €. Non era un errore dell'import: nel
 *     legacy quel campo era proprio vuoto.
 *  2. Le altre non combaciavano con la somma delle righe — erano piu' alte.
 *
 * Misurando il rapporto fra dichiarato e righe la mediana e' venuta 1,220
 * esatta: l'IVA al 22%. Su 267 fatture compilate, 194 sono la somma delle
 * righe x 1,22 al centesimo. Il dichiarato quindi e' il totale CON IVA, e le
 * righe sono l'imponibile.
 *
 * Da qui:
 *  - `netAmount`  = somma delle righe (sempre vera, si ricostruisce dai dati)
 *  - `totalAmount`= il dichiarato dove c'e'; dove era 0, imponibile x 1,22
 *  - `legacyTotalAmount` = il dichiarato com'era, zeri compresi
 *
 * Le 73 fatture il cui dichiarato non e' ne' l'uno ne' l'altro NON si toccano:
 * il documento e' stato emesso con quel numero e resta quello. Il conto e' in
 * fondo all'output.
 *
 * Di default non scrive: `--scrivi` per applicare.
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const scrivi = process.argv.includes('--scrivi');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice(13).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const ALIQUOTA = 22;
const conIva = (n) => Math.round(n * (1 + ALIQUOTA / 100) * 100) / 100;

const fatture = await db.invoice.findMany({
  where: { NOT: { legacyId: null } },
  select: { id: true, legacyId: true, number: true, totalAmount: true, legacyTotalAmount: true,
            lines: { select: { amount: true } } },
});

let coerenti = 0, ricostruite = 0, divergenti = 0;
let sommaPrima = 0, sommaDopo = 0;
const esempi = [];

for (const f of fatture) {
  const netAmount = Math.round(f.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  // `legacyTotalAmount` e' gia' valorizzato se lo script e' stato rilanciato:
  // in quel caso il dichiarato vero e' quello, non `totalAmount` gia' corretto.
  const dichiarato = f.legacyTotalAmount ?? f.totalAmount;
  const atteso = conIva(netAmount);

  let totalAmount, caso;
  if (dichiarato > 0 && Math.abs(dichiarato - atteso) <= Math.max(0.02, netAmount * 0.006)) {
    totalAmount = dichiarato; caso = 'coerente'; coerenti++;
  } else if (dichiarato > 0) {
    totalAmount = dichiarato; caso = 'divergente'; divergenti++;
    if (esempi.length < 5) esempi.push({ n: f.number ?? f.legacyId, dichiarato, netAmount, atteso });
  } else {
    totalAmount = atteso; caso = 'ricostruita'; ricostruite++;
  }

  sommaPrima += f.totalAmount;
  sommaDopo += totalAmount;

  if (scrivi) {
    await db.invoice.update({
      where: { id: f.id },
      data: { netAmount, vatRate: ALIQUOTA, totalAmount, legacyTotalAmount: dichiarato },
    });
  }
}

console.log(scrivi ? 'SCRITTURA' : 'SIMULAZIONE — rilancia con --scrivi');
console.log('fatture storiche:', fatture.length);
console.log('  ✅ dichiarato = imponibile + IVA 22% .....', coerenti);
console.log('  🔧 dichiarato mancante, totale ricostruito', ricostruite);
console.log('  ⚠️ dichiarato diverso, LASCIATO com\'era ..', divergenti);
console.log('');
console.log('  totale fatturato prima:', sommaPrima.toLocaleString('it-IT', { minimumFractionDigits: 2 }), '€');
console.log('  totale fatturato dopo: ', sommaDopo.toLocaleString('it-IT', { minimumFractionDigits: 2 }), '€');
console.log('\n  esempi di divergenti (non toccate):');
for (const e of esempi)
  console.log(`     ${String(e.n).padStart(14)} · documento ${e.dichiarato.toFixed(2)} € · imponibile ${e.netAmount.toFixed(2)} € · con IVA sarebbe ${e.atteso.toFixed(2)} €`);

await db.$disconnect();

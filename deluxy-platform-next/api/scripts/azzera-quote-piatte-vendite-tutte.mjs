/**
 * ESTENDE la pulizia delle quote piatte a TUTTE le vendite pendenti
 * (decisione utente 02/09: «prendi tutto da canone e sistema anche
 * precedenti» — il 01/09 s'erano corrette solo quelle del 31/08–01/09).
 *
 * Perimetro: vendite VIVE, price > 0, NON fatturate, senza righe di fattura
 * né di stipendio. Dove la quota scritta diverge dal canone (fee% × valore
 * merce dalla cascata ufficiale) il campo si SVUOTA — vuoto = calcola, mai
 * riscrivere il numero (si ricongelerebbe). Restano fuori: quote già a
 * canone, vendite senza merce o senza listino (azzerarle distruggerebbe
 * l'unico numero che hanno). Log su ogni consegna, prova a vuoto di default,
 * con --applica scrive (backup json prima).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();

const r2 = (n) => Math.round(n * 100) / 100;
const eur = (n) => n.toLocaleString('it-IT', { minimumFractionDigits: 2 });

const cons = await prisma.delivery.findMany({
  where: {
    deletedAt: null, price: { gt: 0 }, invoiced: false,
    invoiceLines: { none: {} }, salaryLines: { none: {} },
    serviceType: { pricingModel: 'VENDITA' },
  },
  select: {
    id: true, code: true, date: true, price: true, productValue: true,
    partnerId: true, serviceTypeId: true,
    partner: { select: { insegna: true } },
    products: { where: { deletedAt: null }, select: { price: true, quantity: true,
      productVariant: { select: { price: true, publicPrice: true } },
      product: { select: { price: true, publicPrice: true } } } },
  },
  orderBy: { code: 'asc' },
});
const listini = new Map();
for (const l of await prisma.partnerService.findMany({ select: { partnerId: true, serviceTypeId: true, price: true } }))
  listini.set(`${l.partnerId}|${l.serviceTypeId}`, l.price);

const backup = [];
let corrette = 0, giaCanone = 0, senzaBase = 0, righeAvvelenate = 0;
let deltaGiu = 0, deltaSu = 0;
for (const c of cons) {
  const fee = listini.get(`${c.partnerId}|${c.serviceTypeId}`);
  const somma = r2(c.products.reduce((s, p) => s +
    (p.price ?? p.productVariant?.price ?? p.productVariant?.publicPrice ?? p.product?.price ?? p.product?.publicPrice ?? 0) * (p.quantity ?? 1), 0));
  const pv = c.productValue ?? 0;
  const valore = somma === 0 && pv > 0 ? pv : somma;
  if (fee == null || valore <= 0) { senzaBase++; continue; }
  const canone = r2((valore * fee) / 100);
  if (Math.abs(c.price - canone) <= 0.01) { giaCanone++; continue; }
  // ⚠️⚠️ LA TRAPPOLA DELLE RIGHE LEGACY (#63200): su alcune righe importate
  // `quantity` è il NUMERO DI FIORI (100 rose) e `price` il listino del
  // prodotto — righe × quantità dà 135.000 su una vendita da 700. Lì la
  // verità è `productValue` (la quota legacy = fee% × productValue torna al
  // centesimo): la quota si RISPETTA e si segnala la RIGA, non si azzera.
  if (pv > 0 && Math.abs(c.price - r2((pv * fee) / 100)) <= 0.02 && Math.abs(somma - pv) > 0.02) {
    righeAvvelenate++;
    console.log(`  🧪 #${c.code} ${c.partner.insegna.slice(0, 24).padEnd(25)} quota ${eur(c.price)} COERENTE con productValue ${eur(pv)} — righe che sommano ${eur(somma)}: RIGA avvelenata, quota NON toccata`);
    continue;
  }
  corrette++;
  if (c.price < canone) deltaGiu += canone - c.price; else deltaSu += c.price - canone;
  console.log(`  #${c.code} ${c.date.toISOString().slice(0, 10)} ${c.partner.insegna.slice(0, 24).padEnd(25)} quota ${eur(c.price)} → vuota (canone: ${fee}% × ${eur(valore)} = ${eur(canone)})`);
  if (!APPLICA) continue;
  backup.push({ id: c.id, code: c.code, price: c.price });
  await prisma.delivery.update({ where: { id: c.id }, data: {
    price: null,
    logs: { create: [{ type: 'price_fix', message: `Quota corretta: ${eur(c.price)} scritta/congelata → azzerata, vale il listino: ${fee}% × ${eur(valore)} = ${eur(canone)}. Estensione della pulizia quote piatte a tutto il pendente (utente, 02/09).` }] },
  } });
}
console.log(`\nvendite pendenti col prezzo scritto: ${cons.length} · da azzerare ${corrette} · già canone ${giaCanone} · righe avvelenate (quota rispettata) ${righeAvvelenate} · senza merce/listino ${senzaBase}`);
console.log(`sotto il canone (recuperati): ${eur(r2(deltaGiu))} € · sopra il canone (restituiti): ${eur(r2(deltaSu))} €`);
if (APPLICA) {
  const file = `C:/Users/nicol/AppData/Local/Temp/claude/backup-quote-piatte-tutte-${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify(backup, null, 1));
  console.log(`✅ applicato. Backup: ${file}`);
} else {
  console.log('(prova a vuoto: rilanciare con --applica)');
}
await prisma.$disconnect();

/**
 * AZZERA le quote piatte sulle VENDITE del 31/08–01/09 (decisione utente
 * 01/09: «si sistema tutto così», dopo la tabella pubblico/partner).
 *
 * Il difetto: su ~20 vendite il campo `price` (la quota Deluxy) portava un
 * numero piatto scritto a mano — spesso la fee ricopiata in euro (fee 25% →
 * «25,00 €») — e per il canone uno scritto > 0 VINCE sul calcolo: su merce da
 * 320 € (Cantina Franco #100789) avremmo trattenuto 15 € invece di 64.
 * Misurato sui due giorni: sottofatturato 215,82 € · sovrafatturato 121,40 €.
 *
 * Il rimedio NON è scrivere la quota giusta (sarebbe un altro numero congelato
 * che smette di seguire il listino): si SVUOTA il campo — vuoto = calcola —
 * e la quota rinasce da fee% × valore merce a ogni lettura.
 *
 * Si toccano solo: vendite dei due giorni, vive, con price > 0, quota DIVERSA
 * dal canone, valore merce > 0 (le 4 senza righe restano fuori: azzerarle
 * distruggerebbe l'unico numero che hanno), niente fattura né stipendio.
 * Ogni cambio lascia una riga nel registro della consegna.
 *
 * Di default PROVA A VUOTO; con --applica scrive (backup json prima).
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
    deletedAt: null, price: { gt: 0 },
    date: { gte: new Date('2026-08-31T00:00:00Z'), lt: new Date('2026-09-02T00:00:00Z') },
    serviceType: { pricingModel: 'VENDITA' },
  },
  select: {
    id: true, code: true, price: true, productValue: true, invoiced: true,
    partnerId: true, serviceTypeId: true,
    partner: { select: { insegna: true } },
    products: { where: { deletedAt: null }, select: { price: true, quantity: true,
      productVariant: { select: { price: true, publicPrice: true } },
      product: { select: { price: true, publicPrice: true } } } },
    invoiceLines: { select: { id: true } }, salaryLines: { select: { id: true } },
  },
  orderBy: { code: 'asc' },
});

const backup = [];
let corrette = 0, giaCanone = 0, senzaMerce = 0, bloccate = 0;
for (const c of cons) {
  const ps = await prisma.partnerService.findUnique({
    where: { partnerId_serviceTypeId: { partnerId: c.partnerId, serviceTypeId: c.serviceTypeId } },
    select: { price: true },
  });
  const fee = ps?.price;
  // La cascata ufficiale di common/valore-prodotti.ts.
  const somma = c.products.reduce((s, p) => s +
    (p.price ?? p.productVariant?.price ?? p.productVariant?.publicPrice ?? p.product?.price ?? p.product?.publicPrice ?? 0) * (p.quantity ?? 1), 0);
  const valore = somma === 0 && (c.productValue ?? 0) > 0 ? c.productValue : r2(somma);
  if (fee == null || valore <= 0) { senzaMerce++; console.log(`  — #${c.code} ${c.partner.insegna}: senza ${fee == null ? 'listino' : 'merce'}, NON toccata`); continue; }
  const canone = r2((valore * fee) / 100);
  if (Math.abs(c.price - canone) <= 0.01) { giaCanone++; continue; }
  if (c.invoiced || c.invoiceLines.length || c.salaryLines.length) { bloccate++; console.log(`  ⚠️ #${c.code}: fatturata/in stipendio, NON toccata`); continue; }
  corrette++;
  console.log(`  #${c.code} ${c.partner.insegna.slice(0, 24).padEnd(25)} quota ${eur(c.price)} → vuota (canone: ${fee}% × ${eur(valore)} = ${eur(canone)})`);
  if (!APPLICA) continue;
  backup.push({ id: c.id, code: c.code, price: c.price });
  await prisma.delivery.update({ where: { id: c.id }, data: {
    price: null,
    logs: { create: [{ type: 'price_fix', message: `Quota corretta: ${eur(c.price)} scritta a mano (numero piatto) → azzerata, vale il listino: ${fee}% × ${eur(valore)} = ${eur(canone)}. Pulizia quote piatte del 31/08–01/09 (utente, 01/09).` }] },
  } });
}
console.log(`\nvendite col prezzo scritto nei 2 giorni: ${cons.length} · da azzerare ${corrette} · già canone ${giaCanone} · senza merce/listino ${senzaMerce} · bloccate ${bloccate}`);
if (APPLICA) {
  const file = `C:/Users/nicol/AppData/Local/Temp/claude/backup-quote-piatte-${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify(backup, null, 1));
  console.log(`✅ applicato. Backup: ${file}`);
} else {
  console.log('(prova a vuoto: rilanciare con --applica)');
}
await prisma.$disconnect();

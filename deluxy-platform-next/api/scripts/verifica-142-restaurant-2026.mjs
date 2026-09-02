/**
 * VERIFICA (sola lettura) delle consegne 2026 di «142 Restaurant»
 * (richiesta utente 02/09: «controlla tutte le consegne del 2026 …
 * verifica la correttezza di tutti i dati»).
 *
 * Per ogni consegna si ricalcola il canone col metodo del server
 * (deliveries.service: A_ORA = ore×tariffa; FISSO in città = base + km oltre
 * gli inclusi × €/km; FISSO fuori città = TUTTI i km × € fuori città, che
 * SOSTITUISCE la base; VENDITA = fee% × valore prodotti) e si confronta con
 * quanto scritto. Si guardano anche: ore mancanti sugli a-ora, prodotti
 * mancanti, indirizzi senza città, provincia/coordinate assenti, date
 * sospette, dentro/fuori città incoerente con gli indirizzi.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();
const r2 = (n) => Math.round(n * 100) / 100;

// Copia fedele di cittaDaIndirizzo (deliveries.service.ts): l'ultimo pezzo
// leggibile dell'indirizzo prima di CAP/provincia; con cifre o troppo lungo
// non è una città (= non deducibile).
function cittaDaIndirizzo(indirizzo) {
  if (!indirizzo) return null;
  const pezzi = indirizzo.split(',').map((p) => p.trim()).filter(Boolean);
  if (pezzi.length < 2) return null;
  for (let i = pezzi.length - 1; i >= 1; i--) {
    const conCap = pezzi[i].match(/^\d{5}\s+(.+?)(\s+[A-Z]{2})?$/);
    if (conCap) return conCap[1].toLowerCase();
  }
  const ultimo = pezzi[pezzi.length - 1];
  if (/^ital/i.test(ultimo) && pezzi.length >= 3) {
    const candidata = pezzi[pezzi.length - 2].replace(/\s+[A-Z]{2}$/, '');
    if (!candidata || /\d/.test(candidata) || candidata.length > 40) return null;
    return candidata.toLowerCase();
  }
  const candidata = ultimo.replace(/\s+[A-Z]{2}$/, '');
  if (!candidata || /\d/.test(candidata) || candidata.length > 40) return null;
  return candidata.toLowerCase();
}

const partner = await prisma.partner.findFirst({
  where: { insegna: { contains: '142', mode: 'insensitive' } },
  select: { id: true, insegna: true, kmIncluded: true, extraOutOfCityPrice: true, address: true },
});
if (!partner) { console.error('Partner «142» non trovato.'); process.exit(1); }
console.log(`Partner: ${partner.insegna} (${partner.id}) — scheda: kmInclusi=${partner.kmIncluded}, €fuoriCittà=${partner.extraOutOfCityPrice}`);

const listini = new Map(
  (await prisma.partnerService.findMany({ where: { partnerId: partner.id } }))
    .map((l) => [l.serviceTypeId, l]),
);

const cons = await prisma.delivery.findMany({
  where: {
    partnerId: partner.id, deletedAt: null,
    date: { gte: new Date('2026-01-01'), lt: new Date('2027-01-01') },
  },
  select: {
    code: true, date: true, status: true, price: true, additionalPrice: true,
    hours: true, distanceKm: true, extraKm: true, extraOutOfCity: true,
    productValue: true, billable: true, invoiced: true, provinceId: true,
    latitude: true, valetSalary: true, pickupAddress: true, recipientAddress: true,
    deliveryTimeFrom: true, serviceTypeId: true,
    serviceType: { select: { name: true, pricingModel: true, basePrice: true } },
    products: { where: { deletedAt: null }, select: { quantity: true, price: true,
      productVariant: { select: { price: true, publicPrice: true } },
      product: { select: { price: true, publicPrice: true } } } },
    invoiceLines: { select: { id: true } },
    salaryLines: { select: { id: true } },
    valet: { select: { firstName: true, lastName: true } },
  },
  orderBy: { date: 'asc' },
});
console.log(`Consegne 2026: ${cons.length}\n`);

let anomalie = 0;
for (const c of cons) {
  const l = listini.get(c.serviceTypeId);
  const mod = c.serviceType?.pricingModel ?? '?';
  const problemi = [];

  // canone atteso
  let atteso = null;
  if (mod === 'A_ORA') {
    const tariffa = (l?.price ?? 0) > 0 ? l.price : (c.serviceType?.basePrice ?? 0);
    if (!c.hours || c.hours <= 0) problemi.push('ore MANCANTI (a-ora)');
    else if (tariffa > 0) atteso = r2(tariffa * Math.max(c.hours, 1));
  } else if (mod === 'PREZZO_FISSO') {
    const base = (l?.price ?? 0) > 0 ? l.price : (c.serviceType?.basePrice ?? 0);
    if (c.extraOutOfCity) {
      const tariffa = (l?.extraOutOfCityPrice ?? 0) > 0 ? l.extraOutOfCityPrice : (partner.extraOutOfCityPrice ?? 0);
      if (c.distanceKm != null && tariffa > 0) atteso = r2(c.distanceKm * tariffa);
      else if (c.distanceKm == null) problemi.push('fuori città ma km NON misurati');
      else atteso = base;
    } else {
      const inclusi = (l?.includedKm ?? 0) > 0 ? l.includedKm : (partner.kmIncluded ?? 0);
      const oltre = c.distanceKm != null ? Math.max(0, Math.round((c.distanceKm - inclusi) * 10) / 10) : 0;
      atteso = r2(base + oltre * (l?.extraKmPrice ?? 0));
    }
  } else if (mod === 'VENDITA') {
    const fee = l?.price ?? 0;
    const righe = r2(c.products.reduce((s, p) => s + (p.price ?? p.productVariant?.price ?? p.productVariant?.publicPrice ?? p.product?.price ?? p.product?.publicPrice ?? 0) * (p.quantity ?? 1), 0));
    const valore = righe > 0 ? righe : (c.productValue ?? 0);
    if (fee > 0 && valore > 0) atteso = r2((valore * fee) / 100);
    if (!c.products.length && !c.productValue) problemi.push('vendita SENZA merce (né righe né valore)');
  }

  // confronto prezzo
  if (c.price != null && c.price > 0 && atteso != null && Math.abs(c.price - atteso) > 0.02) {
    problemi.push(`prezzo scritto ${c.price} ≠ canone ${atteso}`);
  }
  if ((c.price == null || c.price === 0) && atteso == null && mod !== 'VENDITA' && !problemi.length) {
    problemi.push('prezzo vuoto e canone non calcolabile (listino a 0?)');
  }

  // dentro/fuori città vs indirizzi
  const cR = cittaDaIndirizzo(c.pickupAddress ?? '');
  const cC = cittaDaIndirizzo(c.recipientAddress ?? '');
  const fuoriAtteso = Boolean(cR && cC && cR !== cC);
  if (Boolean(c.extraOutOfCity) !== fuoriAtteso) {
    problemi.push(`flag fuori-città=${c.extraOutOfCity ? 'sì' : 'no'} ma indirizzi dicono ${fuoriAtteso ? 'sì' : 'no'} (${cR ?? '?'} → ${cC ?? '?'})`);
  }

  // completezza dati
  if (!c.recipientAddress?.trim()) problemi.push('indirizzo di consegna VUOTO');
  else if (!cC) problemi.push('città non leggibile nell\'indirizzo di consegna');
  if (!c.provinceId) problemi.push('provincia assente');
  if (c.latitude == null) problemi.push('coordinate assenti (fuori mappa)');
  if (mod !== 'A_ORA' && !c.products.length) problemi.push('nessun prodotto');
  if (!c.deliveryTimeFrom) problemi.push('fascia oraria assente');
  if (c.invoiced && !c.invoiceLines.length) problemi.push('marcata fatturata ma senza righe di fattura (eredità legacy)');

  const dataS = c.date.toISOString().slice(0, 10);
  const testa = `#${c.code} ${dataS} ${c.status} · ${c.serviceType?.name ?? '?'} [${mod}] · prezzo=${c.price ?? '—'}${atteso != null ? ` (canone ${atteso})` : ''}${c.hours ? ` · ore=${c.hours}` : ''}${c.distanceKm != null ? ` · km=${c.distanceKm}` : ''}${c.extraOutOfCity ? ' · FUORI CITTÀ' : ''}`;
  if (problemi.length) { anomalie++; console.log(`⚠️ ${testa}\n     → ${problemi.join(' · ')}`); }
  else console.log(`✓ ${testa}`);
}
console.log(`\nTotale: ${cons.length} consegne, ${anomalie} con anomalie.`);
await prisma.$disconnect();

/**
 * Confronto CAMPO PER CAMPO fra il database originale (CSV legacy) e la
 * piattaforma, per le due consegne della coppia corporate.
 */
import fs from 'node:fs';
import path from 'node:path';
const TAB = 'C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle';
function leggi(nome) {
  const testo = fs.readFileSync(path.join(TAB, `${nome}.csv`), 'utf8');
  const righe = []; let riga = [], campo = '', inStr = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (inStr) {
      if (c === '"' && testo[i + 1] === '"') { campo += '"'; i++; continue; }
      if (c === '"') { inStr = false; continue; }
      campo += c; continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === ',') { riga.push(campo); campo = ''; continue; }
    if (c === '\n') { riga.push(campo); righe.push(riga); riga = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo || riga.length) { riga.push(campo); righe.push(riga); }
  const testa = righe.shift();
  return righe.map((r) => Object.fromEntries(testa.map((k, i) => [k, r[i]])));
}

const rigaEnv = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=5`;
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();

const legacy = leggi('delivery');
const partnerLegacy = new Map(leggi('partner').map((x) => [x.id, x]));
const expertLegacy = new Map(leggi('expert').map((x) => [x.id, x]));
const serviceLegacy = new Map(leggi('service').map((x) => [x.id, x]));
const psLegacy = leggi('partner-service');
const esLegacy = leggi('expert-service');

const COPPIE = [
  ['62454', 'Casati 14 — corporate'],
  ['62455', "MALI'A — vendita"],
];

for (const [id, eti] of COPPIE) {
  const L = legacy.find((x) => x.id === id);
  const P = await p.delivery.findFirst({
    where: { legacyId: Number(id) },
    select: {
      code: true, legacyId: true, price: true, additionalPrice: true, productValue: true,
      payable: true, billable: true, invoiced: true, distanceKm: true, hours: true,
      valetSalary: true, valetAdditionalPrice: true, status: true,
      partner: { select: { insegna: true, legacyId: true } },
      serviceType: { select: { name: true, pricingModel: true, legacyId: true } },
      valet: { select: { firstName: true, lastName: true, legacyId: true } },
    },
  });
  console.log('\n' + '═'.repeat(74));
  console.log(`${id}  ${eti}`);
  console.log('═'.repeat(74));
  const riga = (et, a, b) => {
    const ok = String(a) === String(b) ? '  ' : '≠ ';
    console.log(`${ok}${et.padEnd(24)} legacy ${String(a).padEnd(22)} piattaforma ${b}`);
  };
  riga('price', L.price, P?.price);
  riga('productValue', L.productValue, P?.productValue);
  riga('additionalPrice', L.additionalPrice, P?.additionalPrice);
  riga('billable', L.billable === '1', P?.billable);
  riga('payable', L.payable === '1', P?.payable);
  riga('invoiced', L.invoiced === '1', P?.invoiced);
  riga('status', L.status, P?.status);
  riga('distance', L.distance || '—', P?.distanceKm ?? '—');
  riga('hours', L.hours, P?.hours);
  riga('expertSalary', L.expertSalary, P?.valetSalary);
  riga('valetAdditionalPrice', L.valetAdditionalPrice, P?.valetAdditionalPrice);
  riga('partner (legacyId)', L.partnerId, P?.partner?.legacyId);
  riga('servizio (legacyId)', L.service, P?.serviceType?.legacyId);
  riga('valet (legacyId)', L.expertId, P?.valet?.legacyId);
  console.log(`   servizio: legacy «${serviceLegacy.get(L.service)?.serviceName ?? '?'}» (${serviceLegacy.get(L.service)?.pricingModel ?? '?'})  ·  piattaforma «${P?.serviceType?.name}» (${P?.serviceType?.pricingModel})`);
  console.log(`   partner : legacy «${partnerLegacy.get(L.partnerId)?.name ?? '?'}»  ·  piattaforma «${P?.partner?.insegna}»`);

  // Il listino del partner per quel servizio, nel legacy.
  const listino = psLegacy.filter((x) => x.partnerId === L.partnerId && x.serviceId === L.service && (!x.deletedAt || x.deletedAt === 'NULL' || x.deletedAt === ''));
  console.log(`   listino legacy (partner-service): ${listino.length ? listino.map((x) => `price=${x.price} perItem=${x.pricePerItem} extraKm=${x.extraKmPrice} includedKm=${x.includedKm}`).join(' | ') : 'NESSUNO'}`);
  // Il listino del valet.
  const lv = esLegacy.filter((x) => x.id === L.expertServiceId);
  console.log(`   expertServiceId ${L.expertServiceId} → ${lv.length ? JSON.stringify(lv[0]) : 'NON TROVATO in expert-service'}`);
}
await p.$disconnect();

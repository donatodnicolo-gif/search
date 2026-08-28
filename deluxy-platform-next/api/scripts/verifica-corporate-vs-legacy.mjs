/**
 * RIVERIFICA SUL DATABASE ORIGINALE (28/08/2026, chiesta dall'utente).
 *
 * Confronta campo per campo una coppia corporate — la consegna «aziendale» e
 * la sua gemella di vendita — fra i CSV del legacy (`legacy/tabelle/`) e la
 * piattaforma, e poi tutto l'archivio sui campi del denaro.
 *
 * ⚠️ Serve perché una tabella costruita leggendo SOLO la piattaforma può
 * sembrare coerente ed essere sbagliata: è già successo. Il legacy è l'unica
 * controprova indipendente che abbiamo.
 *
 * ⚠️ Il CSV è una FOTOGRAFIA del giorno dell'export: `invoiced` diverge su
 * 19.502 consegne non perché l'import abbia sbagliato, ma perché la
 * piattaforma ha emesso fatture dopo. Non è un errore, è il tempo che passa.
 *
 * Non scrive niente.
 */
import fs from 'node:fs';
import path from 'node:path';

const TAB = 'C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle';

/** Il parser dei CSV del legacy: virgolette, virgole nei campi, "" raddoppiate. */
function leggi(nome) {
  const file = path.join(TAB, `${nome}.csv`);
  if (!fs.existsSync(file)) return [];
  const testo = fs.readFileSync(file, 'utf8');
  const righe = [];
  let riga = [], campo = '', inStr = false;
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

const rigaEnv = fs
  .readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=5`;
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();

const legacy = leggi('delivery');
const servizi = new Map(leggi('service').map((x) => [x.id, x]));
const listinoPartner = leggi('partner-service');
const listinoValet = leggi('expert-service');
const righeProdotto = leggi('delivery-product');

// ---- 1. La coppia, campo per campo.
for (const [id, eti] of [['62454', 'chi ordina — aziendale'], ['62455', 'chi fornisce — vendita']]) {
  const L = legacy.find((x) => x.id === id);
  if (!L) { console.log(`#${id}: assente dal CSV legacy`); continue; }
  const P = await p.delivery.findFirst({
    where: { legacyId: Number(id) },
    select: {
      code: true, price: true, additionalPrice: true, productValue: true,
      payable: true, billable: true, invoiced: true, distanceKm: true, hours: true,
      valetSalary: true, valetAdditionalPrice: true, status: true,
      partner: { select: { insegna: true, legacyId: true } },
      serviceType: { select: { name: true, pricingModel: true, legacyId: true } },
      valet: { select: { firstName: true, lastName: true, legacyId: true } },
    },
  });
  console.log('\n' + '='.repeat(74));
  console.log(`${id}  ${eti}  —  ${P?.partner?.insegna ?? '?'}`);
  console.log('='.repeat(74));
  const riga = (et, a, b) =>
    console.log(`${String(a) === String(b) ? '  ' : '≠ '}${et.padEnd(22)} legacy ${String(a).padEnd(20)} piattaforma ${b}`);
  riga('price', L.price, P?.price);
  riga('productValue', L.productValue, P?.productValue);
  riga('additionalPrice', L.additionalPrice, P?.additionalPrice);
  riga('billable', L.billable === '1', P?.billable);
  riga('payable', L.payable === '1', P?.payable);
  riga('invoiced', L.invoiced === '1', P?.invoiced);
  riga('status', L.status, P?.status);
  riga('distance', L.distance || '—', P?.distanceKm ?? '—');
  riga('expertSalary', L.expertSalary, P?.valetSalary);
  riga('partner (legacyId)', L.partnerId, P?.partner?.legacyId);
  riga('servizio (legacyId)', L.service, P?.serviceType?.legacyId);
  riga('valet (legacyId)', L.expertId, P?.valet?.legacyId);
  const sv = servizi.get(L.service);
  console.log(`   servizio: legacy «${sv?.serviceName ?? '?'}» (${sv?.pricingModel ?? '?'})  ·  piattaforma «${P?.serviceType?.name}» (${P?.serviceType?.pricingModel})`);
  const lp = listinoPartner.filter((x) => x.partnerId === L.partnerId && x.serviceId === L.service);
  console.log(`   listino partner: ${lp.length ? lp.map((x) => `price=${x.price} extraKm=${x.extraKmPrice}`).join(' | ') : 'NESSUNO'}`);
  const lv = listinoValet.find((x) => x.id === L.expertServiceId);
  const svValet = lv ? servizi.get(lv.serviceId) : null;
  console.log(`   listino valet: expertServiceId ${L.expertServiceId} → ${lv ? `servizio ${lv.serviceId} «${svValet?.serviceName ?? 'INESISTENTE'}» salary ${lv.salary} km ${lv.minimumKmPrice}` : 'NON TROVATO'}`);
  const righe = righeProdotto.filter((x) => x.deliveryId === id && (!x.deletedAt || x.deletedAt === 'NULL'));
  const somma = righe.reduce((s, x) => s + Number(x.price ?? 0) * Number(x.quantity ?? 0), 0);
  console.log(`   righe prodotto: ${righe.length}, somma ${somma.toFixed(2)}  ⚠️ productValue del legacy: ${L.productValue}`);
}

// ---- 2. Tutto l'archivio, sui campi del denaro.
console.log('\n' + '='.repeat(74));
console.log("CONFRONTO SU TUTTO L'ARCHIVIO");
console.log('='.repeat(74));
const perId = new Map(legacy.map((x) => [Number(x.id), x]));
const nostre = await p.delivery.findMany({
  where: { legacyId: { not: null }, deletedAt: null },
  select: { legacyId: true, code: true, invoiced: true, price: true, productValue: true, billable: true, payable: true },
});
const q2 = (v) => (v == null || v === '' || v === 'NULL' ? null : Math.round(Number(v) * 100) / 100);
const conta = { price: 0, productValue: 0, billable: 0, payable: 0, invoiced: 0, mancanti: 0 };
const esempi = { price: [], productValue: [] };
for (const n of nostre) {
  const L = perId.get(n.legacyId);
  if (!L) { conta.mancanti++; continue; }
  if (q2(L.price) !== q2(n.price)) { conta.price++; if (esempi.price.length < 6) esempi.price.push(`#${n.code} ${L.price}→${n.price}`); }
  if (q2(L.productValue) !== q2(n.productValue)) { conta.productValue++; if (esempi.productValue.length < 6) esempi.productValue.push(`#${n.code} ${L.productValue}→${n.productValue}`); }
  if ((L.billable === '1') !== n.billable) conta.billable++;
  if ((L.payable === '1') !== n.payable) conta.payable++;
  if ((L.invoiced === '1') !== n.invoiced) conta.invoiced++;
}
console.log(`consegne confrontate: ${nostre.length}`);
for (const [k, v] of Object.entries(conta)) console.log(`  ${k.padEnd(14)} ${v}`);
for (const [k, v] of Object.entries(esempi)) if (v.length) console.log(`  esempi ${k}: ${v.join(' | ')}`);
console.log('\n⚠️ `invoiced` diverge perché la piattaforma ha emesso fatture DOPO l\'export: non è un errore d\'import.');

await p.$disconnect();

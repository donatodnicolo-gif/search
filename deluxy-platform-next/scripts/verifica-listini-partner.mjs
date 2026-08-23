// Confronta riga per riga i LISTINI dei partner: quello che c'e' in piattaforma
// contro quello che c'e' nel database originario.
//
// Nato dopo il caso 142 RESTAURANT (23/08/2026), dove tre cose non tornavano
// insieme: la fee letta come euro, un servizio di magazzino mostrato a chi il
// magazzino non ha, e la Fee% mai importata. Una scheda sola non basta a dire
// se l'import e' andato bene: si contano tutte.
//
// Confronta, per ogni coppia (partner, servizio):
//   - la riga esiste di qua e di la'
//   - price, pricePerItem, extraKmPrice, includedKm
//   - le righe cancellate nel legacy non devono essere qui
// e verifica la coerenza di hasWarehouse e commissionPercent.
//
// Non scrive niente.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { leggiCsv } from './leggi-csv.mjs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const B = 'C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle/';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1` } } });

const servizi = Object.fromEntries(leggiCsv(B + 'service.csv').map((s) => [s.id, s]));
const listiniLegacy = leggiCsv(B + 'partner-service.csv');
const partnerLegacy = Object.fromEntries(leggiCsv(B + 'partner.csv').map((p) => [p.id, p]));

const nostri = await db.partner.findMany({
  select: {
    id: true, legacyId: true, insegna: true, commissionPercent: true, hasWarehouse: true,
    services: { select: { price: true, pricePerItem: true, extraKmPrice: true, includedKm: true,
                          serviceType: { select: { legacyId: true, name: true, pricingModel: true } } } },
  },
});

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const uguale = (a, b) => {
  const x = num(a), y = num(b);
  if (x === null && (y === null || y === 0)) return true;   // il default 0 vale come «non impostato»
  if (y === null && (x === null || x === 0)) return true;
  return Math.abs((x ?? 0) - (y ?? 0)) < 0.005;
};

const problemi = { mancanti: [], inPiu: [], cancellate: [], prezzi: [], fee: [], magazzino: [] };
let coppieControllate = 0, partnerControllati = 0;

for (const p of nostri) {
  if (p.legacyId === null) continue;
  partnerControllati++;
  const k = String(p.legacyId);
  const suoiLegacy = listiniLegacy.filter((r) => r.partnerId === k);
  const vivi = suoiLegacy.filter((r) => !r.deletedAt);
  const morti = suoiLegacy.filter((r) => r.deletedAt);

  const quiPerServizio = new Map(p.services.filter((s) => s.serviceType.legacyId !== null)
    .map((s) => [String(s.serviceType.legacyId), s]));

  for (const r of vivi) {
    coppieControllate++;
    const qui = quiPerServizio.get(r.serviceId);
    const nome = servizi[r.serviceId]?.serviceName ?? `servizio ${r.serviceId}`;
    if (!qui) { problemi.mancanti.push([p.insegna, nome]); continue; }
    const diff = [];
    if (!uguale(qui.price, r.price)) diff.push(`price ${qui.price} ≠ ${r.price}`);
    if (!uguale(qui.pricePerItem, r.pricePerItem)) diff.push(`pricePerItem ${qui.pricePerItem} ≠ ${r.pricePerItem}`);
    if (!uguale(qui.extraKmPrice, r.extraKmPrice)) diff.push(`extraKm ${qui.extraKmPrice} ≠ ${r.extraKmPrice}`);
    if (diff.length) problemi.prezzi.push([p.insegna, nome, diff.join(' · ')]);
  }
  const idVivi = new Set(vivi.map((r) => r.serviceId));
  const idMorti = new Set(morti.map((r) => r.serviceId));
  for (const [sid, s] of quiPerServizio) {
    if (idVivi.has(sid)) continue;
    if (idMorti.has(sid)) problemi.cancellate.push([p.insegna, s.serviceType.name]);
    else problemi.inPiu.push([p.insegna, s.serviceType.name]);
  }

  // fee attesa dai servizi di vendita
  const perc = [...new Set(vivi.filter((r) => servizi[r.serviceId]?.pricingModel === 'sales').map((r) => Number(r.price)))];
  if (perc.length === 1 && !uguale(p.commissionPercent, perc[0]))
    problemi.fee.push([p.insegna, `qui ${p.commissionPercent}% ≠ legacy ${perc[0]}%`]);
  if (perc.length > 1) problemi.fee.push([p.insegna, `nel legacy ha ${perc.length} percentuali diverse: ${perc.join(' / ')} — da decidere a mano`]);

  const magLegacy = partnerLegacy[k]?.partnerHasWarehouse === '1';
  if (magLegacy !== p.hasWarehouse) problemi.magazzino.push([p.insegna, `qui ${p.hasWarehouse} ≠ legacy ${magLegacy}`]);
}

console.log(`partner controllati: ${partnerControllati} · righe di listino confrontate: ${coppieControllate}\n`);
const mostra = (titolo, righe, formato) => {
  const segno = righe.length ? '🔴' : '✅';
  console.log(`${segno} ${titolo}: ${righe.length}`);
  for (const r of righe.slice(0, 12)) console.log('     ' + formato(r));
  if (righe.length > 12) console.log(`     … e altri ${righe.length - 12}`);
};
mostra('righe del legacy NON importate', problemi.mancanti, ([p, s]) => `${p.slice(0, 28).padEnd(30)} ${s}`);
mostra('righe qui che nel legacy non esistono', problemi.inPiu, ([p, s]) => `${p.slice(0, 28).padEnd(30)} ${s}`);
mostra('righe CANCELLATE nel legacy ma presenti qui', problemi.cancellate, ([p, s]) => `${p.slice(0, 28).padEnd(30)} ${s}`);
mostra('prezzi diversi', problemi.prezzi, ([p, s, d]) => `${p.slice(0, 24).padEnd(26)} ${s.slice(0, 28).padEnd(30)} ${d}`);
mostra('fee non allineata', problemi.fee, ([p, d]) => `${p.slice(0, 28).padEnd(30)} ${d}`);
mostra('flag magazzino non allineato', problemi.magazzino, ([p, d]) => `${p.slice(0, 28).padEnd(30)} ${d}`);
await db.$disconnect();

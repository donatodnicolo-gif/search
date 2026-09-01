/**
 * ARRICCHISCE le consegne APERTE nate dalle vendite con ciò che l'ordine sa già
 * (01/09/2026, regola utente «sistemati anche gli altri ordini»): biglietto →
 * personalizzazione, nota Shopify → note, fascia del cliente → orario consegna.
 * SOLO riempimenti: un campo già scritto non si tocca. Consegne con data da
 * oggi in poi (le storiche chiuse non servono al valet). Anteprima; --applica.
 */
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env','utf8').split(/\r?\n/).find(l=>l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g,''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();

const cfg = await prisma.appSetting.findMany({ where: { key: { in: ['ordersUrl','ordersApiKey'] } } });
const m = Object.fromEntries(cfg.map(r=>[r.key,r.value]));
const url = (m.ordersUrl || '').replace(/\/+$/,''); const key = m.ordersApiKey || '';
if (!url || !key) { console.error('ordersUrl/ordersApiKey assenti.'); process.exit(1); }

const fascia = (raw) => {
  const s = String(raw ?? '').trim();
  const x = s.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*[-\/–]\s*(\d{1,2})(?:[:.](\d{2}))?$/);
  if (!x) return {};
  const ora = (h, min) => { const hh = Number(h); if (!Number.isFinite(hh) || hh > 24) return undefined; return `${String(hh === 24 ? 0 : hh).padStart(2,'0')}:${min ?? '00'}`; };
  return { dalle: ora(x[1], x[2]), alle: ora(x[3], x[4]) };
};

const OGGI = new Date('2026-09-01T00:00:00.000Z');
const venditeRaw = await prisma.sale.findMany({
  where: { deliveryId: { not: null }, externalOrderId: { not: null } },
  select: { id: true, externalOrderId: true, deliveryId: true },
});
const consegne = await prisma.delivery.findMany({
  where: { id: { in: venditeRaw.map((v) => v.deliveryId) }, date: { gte: OGGI }, deletedAt: null },
  select: { id: true, code: true, personalizeSaleNotes: true, notes: true, deliveryTimeFrom: true, deliveryTimeTo: true },
});
const perId = new Map(consegne.map((d) => [d.id, d]));
const vendite = venditeRaw.filter((v) => perId.has(v.deliveryId)).map((v) => ({ ...v, delivery: perId.get(v.deliveryId) }));
console.log(`Consegne aperte (da oggi) nate da vendite: ${vendite.length}`);
const daFare = [];
for (const v of vendite) {
  let o;
  try {
    const r = await fetch(`${url}/api/v1/ordini/${encodeURIComponent(v.externalOrderId)}?annullati=inclusi`, { headers: { 'x-api-key': key } });
    if (!r.ok) continue;
    o = await r.json();
  } catch { continue; }
  const d = v.delivery;
  const dati = {};
  const biglietto = String(o?.biglietto ?? '').trim();
  const nota = String(o?.shopify?.note ?? '').trim();
  const f = fascia(o?.consegna?.fascia);
  if (biglietto && !d.personalizeSaleNotes?.trim()) dati.personalizeSaleNotes = biglietto;
  if (nota && !d.notes?.trim()) dati.notes = nota;
  if (f.dalle && !d.deliveryTimeFrom?.trim()) {
    dati.deliveryTimeFrom = f.dalle;
    if (f.alle && f.alle !== f.dalle) { dati.deliveryTimeTo = f.alle; dati.deliveryFlexible = true; }
  }
  if (Object.keys(dati).length) daFare.push({ id: d.id, code: d.code, dati });
}
console.log(`Da arricchire: ${daFare.length}`);
for (const r of daFare.slice(0, 12)) console.log(`  #${r.code}: ${Object.keys(r.dati).join(', ')}`);
if (daFare.length > 12) console.log(`  … e altre ${daFare.length - 12}`);
if (!APPLICA) { console.log('ANTEPRIMA: niente scritto. Rilancia con --applica.'); await prisma.$disconnect(); process.exit(0); }
let n = 0;
for (const r of daFare) { await prisma.delivery.update({ where: { id: r.id }, data: r.dati }); n++; }
console.log(`ARRICCHITE ${n} consegne (solo campi vuoti).`);
await prisma.$disconnect();

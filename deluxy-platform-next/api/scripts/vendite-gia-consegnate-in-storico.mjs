/**
 * VENDITE GIÀ CONSEGNATE → STORICO (richiesta utente 31/08/2026): una vendita
 * APERTA (da_gestire | proposta) il cui riferimento (externalOrderId) è già il
 * numero DDT di una consegna esistente è lavoro già fatto altrove — si aggancia
 * alla consegna e passa in storico (ACCETTATA), come fa il collegamento manuale.
 * Il DDT si confronta ANCHE sul brand quando la consegna lo dichiara
 * (lo stesso numero esiste su negozi diversi). Anteprima di default; --applica.
 */
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env','utf8').split(/\r?\n/).find(l=>l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g,''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();

const aperte = await prisma.sale.findMany({
  where: { status: { in: ['da_gestire', 'proposta'] }, externalOrderId: { not: null } },
  select: { id: true, externalOrderId: true, brand: true, status: true },
});
console.log(`Vendite aperte con riferimento: ${aperte.length}`);

// ⚠️ `externalOrderId` è il cuid INTERNO di Orders, il DDT è il NUMERO
// dell'ordine: si risolve via API Orders (campo `numero` della risposta).
const cfg = await prisma.appSetting.findMany({ where: { key: { in: ['ordersUrl', 'ordersApiKey'] } } });
const mappa = Object.fromEntries(cfg.map((r) => [r.key, r.value]));
const ordersUrl = (mappa.ordersUrl || '').replace(/\/+$/, '');
const ordersKey = mappa.ordersApiKey || '';
if (!ordersUrl || !ordersKey) { console.error('ordersUrl/ordersApiKey assenti in AppSetting.'); process.exit(1); }

const daChiudere = [];
for (const s of aperte) {
  const rif = s.externalOrderId.trim();
  if (!rif) continue;
  let numero = null;
  try {
    const res = await fetch(`${ordersUrl}/api/v1/ordini/${encodeURIComponent(rif)}?annullati=inclusi`, { headers: { 'x-api-key': ordersKey } });
    if (res.ok) { const o = await res.json(); numero = String(o?.numero ?? '').replace(/^#/, '').trim() || null; }
  } catch { /* ordine non raggiungibile: si salta, non si inventa */ }
  if (!numero) continue;
  const consegne = await prisma.delivery.findMany({
    where: { ddtNumber: { in: [numero, '#' + numero] }, deletedAt: null },
    select: { id: true, code: true, ddtBrand: true, partnerId: true },
  });
  if (!consegne.length) continue;
  // Prima quella col brand giusto; una consegna con brand DIVERSO dichiarato
  // NON è la sua (stesso numero, negozio diverso).
  const conBrand = consegne.find((d) => d.ddtBrand && d.ddtBrand === s.brand);
  const neutre = consegne.filter((d) => !d.ddtBrand);
  const scelta = conBrand ?? (neutre.length ? neutre[0] : null);
  if (!scelta) continue;
  daChiudere.push({ saleId: s.id, rif: numero, stato: s.status, deliveryId: scelta.id, code: scelta.code });
}
console.log(`Da mettere in storico (consegna già esistente col loro DDT): ${daChiudere.length}`);
for (const r of daChiudere.slice(0, 15)) console.log(`  vendita ${r.rif} (${r.stato}) -> consegna #${r.code}`);
if (daChiudere.length > 15) console.log(`  … e altre ${daChiudere.length - 15}`);

if (!APPLICA) { console.log('ANTEPRIMA: niente scritto. Rilancia con --applica.'); await prisma.$disconnect(); process.exit(0); }

let n = 0;
for (const r of daChiudere) {
  await prisma.sale.update({
    where: { id: r.saleId },
    data: {
      status: 'accettata',
      deliveryId: r.deliveryId,
      assignmentReason: `In storico: consegna #${r.code} esisteva già con questo DDT (bonifica 01/09).`,
    },
  });
  n++;
}
console.log(`IN STORICO: ${n} vendite agganciate alla loro consegna.`);
await prisma.$disconnect();

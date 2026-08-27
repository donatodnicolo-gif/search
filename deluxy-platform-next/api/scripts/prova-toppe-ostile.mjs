/**
 * RIVERIFICA delle toppe che l'agente OSTILE ha demolito.
 *
 * Le sue cinque accuse, riprovate una per una sull'api locale contro il
 * database vero. Le scritture di prova si disfano.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.BASE ?? 'http://localhost:3399/api/v1';
const SEGRETO = process.env.SEGRETO ?? 'segreto-solo-per-la-prova-locale';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url: `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const testa = b64({ alg: 'HS256', typ: 'JWT' });
const tok = (x) => {
  const c = b64({ sub: x.id, email: x.email, role: x.role, isSupport: x.isSupport, partnerId: x.partnerId, valetId: x.valetId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 });
  return `${testa}.${c}.${crypto.createHmac('sha256', SEGRETO).update(`${testa}.${c}`).digest('base64url')}`;
};
const chiama = async (metodo, percorso, token, corpo, intestazioni = {}) => {
  const res = await fetch(`${BASE}${percorso}`, {
    method: metodo,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...intestazioni },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const t = await res.text();
  let d = null; try { d = JSON.parse(t); } catch { d = t; }
  return { stato: res.status, dati: d, testo: t };
};
const esito = (n, titolo, ok, dettaglio) =>
  console.log(`${ok ? '✅ REGGE   ' : '🔴 ANCORA '}  #${String(n).padEnd(3)} ${titolo}\n              ${dettaglio}\n`);

const conteggi = await db.delivery.groupBy({ by: ['partnerId'], where: { deletedAt: null }, _count: { _all: true }, orderBy: { _count: { partnerId: 'desc' } }, take: 40 });
const uPartner = await db.user.findFirst({ where: { role: 'PARTNER', status: 'active', partnerId: { in: conteggi.map((c) => c.partnerId).filter(Boolean) } } });
const tP = tok(uPartner);
const ps = await db.partnerService.findFirst({ where: { partnerId: uPartner.partnerId } });
const prodotto = await db.product.findFirst({ where: { OR: [{ partnerId: null }, { partnerId: uPartner.partnerId }] }, select: { id: true, name: true, price: true } });
const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());

// ── #3 il prezzo scritto sulle RIGHE PRODOTTO ────────────────────────────
const creata = await chiama('POST', '/deliveries', tP, {
  date: oggi, serviceTypeId: ps.serviceTypeId,
  recipientFirstName: 'PROVA', recipientLastName: 'OSTILE',
  recipientAddress: 'Piazza Duomo 1, 20121 Milano MI', recipientIntercom: 'p',
  deliveryTimeFrom: '10:00', pickupTimeFrom: '09:00',
  products: [{ productId: prodotto.id, quantity: 1, price: 0.01, flexiblePrice: false }],
});
const id = creata.dati?.id;
const righeProdotto = id ? await db.deliveryProduct.findMany({ where: { deliveryId: id }, select: { price: true } }) : [];
esito(3, 'Il partner si scrive il prezzo dalle RIGHE PRODOTTO',
  righeProdotto.every((r) => r.price !== 0.01),
  `creazione ${creata.stato} · prezzo mandato 0,01 · in colonna: ${righeProdotto.map((r) => r.price).join(', ') || '(nessuna riga)'}`);

// ── #5 la paga del valet nelle risposte di SCRITTURA ──────────────────────
const conValet = await db.delivery.findFirst({
  where: { partnerId: uPartner.partnerId, deletedAt: null, valetSalary: { gt: 0 }, status: 'created' },
  select: { id: true, code: true },
});
let dett5 = 'nessuna consegna «da gestire» con paga valet: niente da provare';
let ok5 = true;
if (conValet) {
  const r = await chiama('PATCH', `/deliveries/${conValet.id}/status`, tP, { status: 'cancellation_requested' });
  const vietati = ['valetSalary', 'valetAdditionalPrice', 'valetServiceId', 'internalNotes'].filter((k) => r.dati && r.dati[k] != null);
  ok5 = vietati.length === 0;
  dett5 = `PATCH status → ${r.stato} · campi del valet nella risposta: ${vietati.length ? vietati.join(', ') : 'nessuno'}`;
  await db.delivery.update({ where: { id: conValet.id }, data: { status: 'created' } });
}
esito(5, 'La paga del valet esce dalle risposte di SCRITTURA', ok5, dett5);

// ── #5-bis i ricorrenti ───────────────────────────────────────────────────
const ric = await chiama('GET', '/recurring-services', tP);
const conPaga = (Array.isArray(ric.dati) ? ric.dati : []).filter((r) => r.valetSalary != null || r.valet != null).length;
esito('5b', 'La paga del valet nei RICORRENTI del partner', conPaga === 0,
  `${ric.stato} · righe ${Array.isArray(ric.dati) ? ric.dati.length : 0} · con paga o valet: ${conPaga}`);

// ── #9 il tracking: righe non vuote, niente cognomi ──────────────────────
// ⚠️ Serve una consegna con log di tipo PUBBLICO, o «righe 0» sarebbe un
// verde che non dimostra niente.
const conToken = await db.delivery.findFirst({
  where: {
    trackingToken: { not: null }, deletedAt: null,
    logs: { some: { type: { in: ['created', 'departed', 'delivered', 'ritiro-forzato', 'cancelled'] } } },
  },
  select: { trackingToken: true, code: true },
});
const tr = await chiama('GET', `/deliveries/tracking/${conToken.trackingToken}`, null);
const logs = tr.dati?.logs ?? [];
const vuote = logs.filter((l) => !l.etichetta).length;
const conMessaggio = logs.filter((l) => 'message' in l).length;
esito(9, 'Il tracking pubblico: etichette scritte da noi, niente testo',
  tr.stato === 200 && vuote === 0 && conMessaggio === 0,
  `#${conToken.code} → ${tr.stato} · righe ${logs.length} · senza etichetta ${vuote} · con testo grezzo ${conMessaggio}` +
  (logs.length ? ` · es. «${logs[0].etichetta}»` : ''));

// ── #10 il freno: per email E per indirizzo di rete ──────────────────────
const IP = '203.0.113.77';
await db.tentativoAccesso.deleteMany({ where: { ip: IP } });
const spray = [];
for (let i = 0; i < 35; i++) {
  const r = await chiama('POST', '/auth/login', null,
    { email: `sconosciuto${i}@esempio.invalid`, password: 'qualsiasi123' },
    { 'x-forwarded-for': IP });
  spray.push(r.stato);
}
const conIp = await db.tentativoAccesso.count({ where: { ip: IP } });
esito(10, 'Lo SPRAY su email diverse dallo stesso indirizzo',
  spray.includes(429),
  `35 email diverse: ${spray.join(' ')} · righe con l'IP registrato: ${conIp}`);
await db.tentativoAccesso.deleteMany({ where: { ip: IP } });

// ── pulizia ───────────────────────────────────────────────────────────────
if (id) {
  await db.activity.deleteMany({ where: { deliveryId: id } });
  await db.deliveryLog.deleteMany({ where: { deliveryId: id } });
  await db.deliveryProduct.deleteMany({ where: { deliveryId: id } });
  await db.delivery.delete({ where: { id } });
  console.log('↩ consegna di prova cancellata.');
}
await db.$disconnect();

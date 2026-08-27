/**
 * PROVA delle eccezioni per giorno e dell'orizzonte di generazione.
 *
 * ⚠️ Lavora su un ricorrente USA-E-GETTA che crea e cancella, e sulle consegne
 * che ne nascono — che poi cancella davvero (delete, non deletedAt: sono nate
 * qui e non devono restare in giro). Non tocca niente di gia' esistente.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.BASE ?? 'http://localhost:3399/api/v1';
const SEGRETO = process.env.SEGRETO ?? 'segreto-solo-per-la-prova-locale';

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url: `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const crypto = await import('node:crypto');
const admin = await db.user.findFirst({ where: { role: 'ADMIN', status: 'active' } });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const testa = b64({ alg: 'HS256', typ: 'JWT' });
const corpo = b64({ sub: admin.id, email: admin.email, role: admin.role, isSupport: admin.isSupport, partnerId: admin.partnerId, valetId: admin.valetId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 });
const token = `${testa}.${corpo}.${crypto.createHmac('sha256', SEGRETO).update(`${testa}.${corpo}`).digest('base64url')}`;

const chiama = async (metodo, percorso, corpoJson) => {
  const res = await fetch(`${BASE}${percorso}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    ...(corpoJson ? { body: JSON.stringify(corpoJson) } : {}),
  });
  let dati = null;
  const testo = await res.text();
  try { dati = JSON.parse(testo); } catch { dati = testo; }
  return { stato: res.status, dati };
};

// Un partner e un suo servizio veri, per non inventare collegamenti.
const ps = await db.partnerService.findFirst({
  where: { partner: { active: true } },
  include: { partner: { select: { id: true, insegna: true } } },
});
const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
console.log(`oggi ${oggi} · partner di prova: ${ps.partner.insegna}\n`);

const base = {
  nome: 'PROVA eccezioni (usa e getta)',
  partnerId: ps.partner.id,
  serviceTypeId: ps.serviceTypeId,
  giorni: '1111111',
  frequenza: 'SETTIMANALE',
  ogni: 1,
  timeFrom: '07:00',
  timeTo: '08:00',
  recipientAddress: 'Via di prova 1, Milano MI',
  dataInizio: oggi,
};

console.log('— i rifiuti che devono esserci —');
const doppio = await chiama('POST', '/recurring-services', {
  ...base,
  varianti: [
    { giorni: '0000011', timeFrom: '08:00', timeTo: '09:00' },
    { giorni: '0000010', timeFrom: '10:00', timeTo: '11:00' },
  ],
});
console.log(`  stesso giorno in due eccezioni → ${doppio.stato}: ${doppio.dati?.message}`);

const alRovescio = await chiama('POST', '/recurring-services', {
  ...base,
  varianti: [{ giorni: '0000011', timeFrom: '09:00', timeTo: '08:00' }],
});
console.log(`  fine prima dell'inizio        → ${alRovescio.stato}: ${alRovescio.dati?.message}`);

const giornoSpento = await chiama('POST', '/recurring-services', {
  ...base,
  giorni: '1111100',
  varianti: [{ giorni: '0000011', timeFrom: '08:00', timeTo: '09:00' }],
});
console.log(`  eccezione su un giorno spento → ${giornoSpento.stato}: ${giornoSpento.dati?.message}`);

console.log('\n— quella buona —');
const buono = await chiama('POST', '/recurring-services', {
  ...base,
  varianti: [{ giorni: '0000011', timeFrom: '08:00', timeTo: '09:00' }],
});
console.log(`  creazione → ${buono.stato}, consegne generate subito: ${buono.dati?.generate?.create} (dal ${buono.dati?.generate?.dal} al ${buono.dati?.generate?.al})`);
const id = buono.dati?.id;

const nate = await db.delivery.findMany({
  where: { recurringServiceId: id },
  select: { code: true, date: true, deliveryTimeFrom: true, deliveryTimeTo: true },
  orderBy: { date: 'asc' },
});
const NOMI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
console.log('\n  giorno per giorno (la fascia deve cambiare sabato e domenica):');
for (const n of nate) {
  const iso = n.date.toISOString().slice(0, 10);
  const dow = (new Date(`${iso}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  const atteso = dow >= 5 ? '08:00-09:00' : '07:00-08:00';
  const vero = `${n.deliveryTimeFrom}-${n.deliveryTimeTo}`;
  console.log(`   ${NOMI[dow]} ${iso}  ${vero}  ${vero === atteso ? '✔' : `✘ atteso ${atteso}`}`);
}

console.log('\n— la seconda generazione non deve raddoppiare —');
const ancora = await chiama('POST', '/recurring-services/genera');
console.log(`  create=${ancora.dati?.create}  giaEsistenti=${ancora.dati?.giaEsistenti}`);

console.log('\n— si modifica la fascia: le future devono seguire —');
const mod = await chiama('PATCH', `/recurring-services/${id}`, {
  ...base,
  timeFrom: '06:00',
  timeTo: '07:00',
  varianti: [{ giorni: '0000011', timeFrom: '11:00', timeTo: '12:00' }],
});
console.log(`  patch → ${mod.stato}, riallineate=${JSON.stringify(mod.dati?.riallineate)}`);
const dopo = await db.delivery.findMany({
  where: { recurringServiceId: id, deletedAt: null },
  select: { date: true, deliveryTimeFrom: true, deliveryTimeTo: true },
  orderBy: { date: 'asc' },
});
let ok = 0, ko = 0, oggiFermo = 0;
for (const n of dopo) {
  const iso = n.date.toISOString().slice(0, 10);
  const dow = (new Date(`${iso}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  const vero = `${n.deliveryTimeFrom}-${n.deliveryTimeTo}`;
  if (iso <= oggi) { oggiFermo++; continue; }
  const atteso = dow >= 5 ? '11:00-12:00' : '06:00-07:00';
  if (vero === atteso) ok++; else { ko++; console.log(`   ✘ ${iso} ${vero}, atteso ${atteso}`); }
}
console.log(`  future in riga: ${ok} · sbagliate: ${ko} · di oggi o passate lasciate stare: ${oggiFermo}`);

console.log('\n— si tolgono giorni: le future di quei giorni devono sparire —');
const tolti = await chiama('PATCH', `/recurring-services/${id}`, { ...base, giorni: '1111100', timeFrom: '06:00', timeTo: '07:00', varianti: [] });
console.log(`  patch → ${tolti.stato}, riallineate=${JSON.stringify(tolti.dati?.riallineate)}`);
const restano = await db.delivery.findMany({ where: { recurringServiceId: id, deletedAt: null }, select: { date: true } });
const weekendRimasti = restano.filter((r) => {
  const iso = r.date.toISOString().slice(0, 10);
  return iso > oggi && (new Date(`${iso}T00:00:00.000Z`).getUTCDay() + 6) % 7 >= 5;
}).length;
console.log(`  weekend futuri ancora vivi: ${weekendRimasti} ${weekendRimasti === 0 ? '✔' : '✘'}`);

console.log('\n— pulizia —');
const daPulire = await db.delivery.findMany({ where: { recurringServiceId: id }, select: { id: true } });
await db.deliveryLog.deleteMany({ where: { deliveryId: { in: daPulire.map((d) => d.id) } } });
await db.activity.deleteMany({ where: { deliveryId: { in: daPulire.map((d) => d.id) } } });
await db.delivery.deleteMany({ where: { recurringServiceId: id } });
await db.recurringService.delete({ where: { id } });
console.log(`  tolte ${daPulire.length} consegne di prova e il ricorrente usa-e-getta.`);
await db.$disconnect();

/**
 * PROVA delle azioni su più consegne insieme, e della generazione fino alla
 * data di fine dichiarata.
 *
 * ⚠️ Lavora su consegne USA-E-GETTA nate da un ricorrente di prova, che poi
 * cancella davvero. Non tocca nessuna consegna vera.
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

const admin = await db.user.findFirst({ where: { role: 'ADMIN', status: 'active' } });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const testa = b64({ alg: 'HS256', typ: 'JWT' });
const corpo = b64({ sub: admin.id, email: admin.email, role: admin.role, isSupport: admin.isSupport, partnerId: admin.partnerId, valetId: admin.valetId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 1800 });
const token = `${testa}.${corpo}.${crypto.createHmac('sha256', SEGRETO).update(`${testa}.${corpo}`).digest('base64url')}`;

const chiama = async (metodo, percorso, corpoJson) => {
  const res = await fetch(`${BASE}${percorso}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    ...(corpoJson ? { body: JSON.stringify(corpoJson) } : {}),
  });
  const t = await res.text();
  let d = null; try { d = JSON.parse(t); } catch { d = t; }
  return { stato: res.status, dati: d };
};

const ps = await db.partnerService.findFirst({
  where: { partner: { active: true } },
  include: { partner: { select: { id: true, insegna: true } }, serviceType: { select: { name: true, pricingModel: true } } },
});
const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
const fine = `${new Date(`${oggi}T00:00:00Z`).getUTCFullYear()}-12-31`;
console.log(`oggi ${oggi} · fino al ${fine} · partner ${ps.partner.insegna} · servizio ${ps.serviceType.name} (listino ${ps.price} €)\n`);

console.log('— 1. la data di fine è l\'orizzonte, non 14 giorni —');
const creato = await chiama('POST', '/recurring-services', {
  nome: 'PROVA azioni di massa (usa e getta)',
  partnerId: ps.partner.id,
  serviceTypeId: ps.serviceTypeId,
  giorni: '1111100',
  frequenza: 'SETTIMANALE',
  ogni: 1,
  timeFrom: '07:00',
  timeTo: '08:00',
  recipientAddress: 'Piazza Duomo 1, 20121 Milano MI',
  dataInizio: oggi,
  dataFine: fine,
});
const id = creato.dati?.id;
const g = creato.dati?.generate;
console.log(`  creazione ${creato.stato}: ${g?.create} consegne dal ${g?.dal} al ${g?.al} (tetto raggiunto: ${g?.fermatoAlTetto})`);

const nate = await db.delivery.findMany({
  where: { recurringServiceId: id },
  select: { id: true, code: true, date: true, price: true, status: true },
  orderBy: { date: 'asc' },
});
console.log(`  in archivio: ${nate.length}, la prima ${nate[0]?.date.toISOString().slice(0, 10)}, l'ultima ${nate[nate.length - 1]?.date.toISOString().slice(0, 10)}`);

console.log('\n— 2. il listino è stato applicato? (prima nasceva a ZERO) —');
const aZero = nate.filter((n) => !n.price).length;
console.log(`  prezzo del listino atteso: ${ps.price} € · consegne con quel prezzo: ${nate.filter((n) => n.price === ps.price).length}/${nate.length} · ancora a zero: ${aZero} ${aZero === 0 ? '✔' : '✘'}`);

console.log('\n— 3. stato su più consegne insieme —');
const dieci = nate.slice(0, 10).map((n) => n.id);
const st = await chiama('PATCH', '/deliveries/massa/stato', { ids: dieci, status: 'in_preparation' });
console.log(`  ${st.stato}: chieste=${st.dati?.chieste} riuscite=${st.dati?.riuscite} fallite=${st.dati?.fallite}`);
const dopoStato = await db.delivery.count({ where: { id: { in: dieci }, status: 'in_preparation' } });
console.log(`  davvero in preparazione: ${dopoStato}/10 ${dopoStato === 10 ? '✔' : '✘'}`);

console.log('\n— 4. assegnazione di massa a un valet vero —');
const valet = await db.valet.findFirst({
  where: { active: true, placeholder: false, provinces: { some: { province: { code: 'MI' } } } },
  select: { id: true, firstName: true, lastName: true },
});
const asg = await chiama('PATCH', '/deliveries/massa/assegna', { ids: dieci, valetId: valet.id });
console.log(`  a ${valet.lastName} ${valet.firstName} → ${asg.stato}: riuscite=${asg.dati?.riuscite} fallite=${asg.dati?.fallite}`);
const conValet = await db.delivery.count({ where: { id: { in: dieci }, valetId: valet.id } });
console.log(`  davvero assegnate: ${conValet}/10 ${conValet === 10 ? '✔' : '✘'}`);

console.log('\n— 5. plus/minus di massa —');
const plus = await chiama('PATCH', '/deliveries/massa/plus-valet', { ids: dieci, importo: 3.5 });
const conPlus = await db.delivery.count({ where: { id: { in: dieci }, valetAdditionalPrice: 3.5 } });
console.log(`  ${plus.stato}: riuscite=${plus.dati?.riuscite} · con 3,50 scritto: ${conPlus}/10 ${conPlus === 10 ? '✔' : '✘'}`);

console.log('\n— 6. i rifiuti attesi —');
console.log('  lista vuota  →', JSON.stringify((await chiama('PATCH', '/deliveries/massa/stato', { ids: [], status: 'delivered' })).dati?.message));
console.log('  stato finto  →', JSON.stringify((await chiama('PATCH', '/deliveries/massa/stato', { ids: dieci, status: 'inventato' })).dati?.message));
const troppi = await chiama('PATCH', '/deliveries/massa/stato', { ids: Array.from({ length: 201 }, (_, i) => `x${i}`), status: 'delivered' });
console.log('  201 id       →', JSON.stringify(troppi.dati?.message));

console.log('\n— 7. un id che non esiste non ferma gli altri —');
const misto = await chiama('PATCH', '/deliveries/massa/stato', { ids: [...nate.slice(10, 13).map((n) => n.id), 'non-esiste'], status: 'in_preparation' });
console.log(`  riuscite=${misto.dati?.riuscite} fallite=${misto.dati?.fallite} · motivo della fallita: ${misto.dati?.esiti?.find((x) => !x.ok)?.errore}`);

console.log('\n— pulizia —');
const ids = nate.map((n) => n.id);
await db.deliveryLog.deleteMany({ where: { deliveryId: { in: ids } } });
await db.activity.deleteMany({ where: { deliveryId: { in: ids } } });
await db.delivery.deleteMany({ where: { recurringServiceId: id } });
await db.recurringService.delete({ where: { id } });
console.log(`  tolte ${ids.length} consegne di prova e il ricorrente usa-e-getta.`);
await db.$disconnect();

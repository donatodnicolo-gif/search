/**
 * PROVA del riempimento a lotti: un ricorrente LUNGO non deve bloccare il
 * salvataggio, e le consegne devono arrivare a scaglioni.
 *
 * Chiesto dall'utente: «se carico 1 servizio ricorrente con 1000 consegne
 * rischiamo di bloccare l'app? magari caricando 15 consegne ogni minuto».
 *
 * Lavora su un ricorrente usa-e-getta e cancella tutto.
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
const db = new PrismaClient({ datasources: { db: { url: `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=5` } } });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const testa = b64({ alg: 'HS256', typ: 'JWT' });
const admin = await db.user.findFirst({ where: { role: 'ADMIN', status: 'active' } });
const c = b64({ sub: admin.id, email: admin.email, role: admin.role, isSupport: admin.isSupport, partnerId: admin.partnerId, valetId: admin.valetId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
const token = `${testa}.${c}.${crypto.createHmac('sha256', SEGRETO).update(`${testa}.${c}`).digest('base64url')}`;

const NOME = 'PROVA-lotti-usa-e-getta';
const pulisci = async () => {
  const ids = (await db.delivery.findMany({ where: { recurringService: { nome: NOME } }, select: { id: true } })).map((x) => x.id);
  if (ids.length) {
    await db.deliveryLog.deleteMany({ where: { deliveryId: { in: ids } } });
    await db.activity.deleteMany({ where: { deliveryId: { in: ids } } });
    await db.deliveryProduct.deleteMany({ where: { deliveryId: { in: ids } } });
    await db.delivery.deleteMany({ where: { id: { in: ids } } });
  }
  await db.recurringService.deleteMany({ where: { nome: NOME } });
  return ids.length;
};
await pulisci();

const ps = await db.partnerService.findFirst({ where: { partner: { active: true } }, include: { partner: { select: { id: true, insegna: true } } } });
const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
const fine = new Date(`${oggi}T00:00:00Z`);
fine.setUTCDate(fine.getUTCDate() + 364);
const fineIso = fine.toISOString().slice(0, 10);

console.log(`ricorrente GIORNALIERO dal ${oggi} al ${fineIso} — 365 consegne da fare\n`);

console.log('① IL SALVATAGGIO DEVE RISPONDERE SUBITO\n');
const avvio = Date.now();
const res = await fetch(`${BASE}/recurring-services`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    nome: NOME, partnerId: ps.partner.id, serviceTypeId: ps.serviceTypeId,
    giorni: '1111111', frequenza: 'GIORNALIERO', ogni: 1,
    timeFrom: '09:00', timeTo: '10:00',
    recipientAddress: 'Piazza Duomo 1, 20121 Milano MI',
    dataInizio: oggi, dataFine: fineIso,
  }),
});
const durata = Date.now() - avvio;
const d = await res.json().catch(() => ({}));
console.log(`  stato ${res.status} · create subito: ${d?.generate?.create} · TEMPO: ${(durata / 1000).toFixed(1)} s`);
console.log(`  ${durata < 5000 ? '✔ risponde subito' : '✘ ci mette troppo'} (prima erano ~34 s per 365)`);

console.log('\n② IL RIEMPIMENTO ARRIVA A LOTTI\n');
// ⚠️ Si chiama LA ROTTA DEL CRON VERA, non il bottone dell'ufficio: sono due
// tetti diversi (150 il lotto, 600 la corsa a mano) e provare quello sbagliato
// non direbbe niente sul comportamento in produzione.
const SEGRETO_CRON = 'cron-solo-per-la-prova-locale';
console.log(`  senza segreto: ${(await fetch(`${BASE}/cron/smistamento`)).status} (atteso 401)`);
let totale = d?.generate?.create ?? 0;
for (let giro = 1; giro <= 4; giro++) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/cron/smistamento`, { headers: { authorization: `Bearer ${SEGRETO_CRON}` } });
  const e = await r.json().catch(() => ({}));
  const ric = e?.ricorrenti ?? {};
  const inArchivio = await db.delivery.count({ where: { recurringService: { nome: NOME } } });
  console.log(`  giro ${giro}: lotto ${ric.lotto} · create ${String(ric.create).padStart(3)} in ${((Date.now() - t0) / 1000).toFixed(1)} s · in archivio ${inArchivio}/365 · ne mancano ancora: ${ric.mancanoAncora}`);
  totale = inArchivio;
  if (inArchivio >= 365) break;
}

console.log('\n③ LA COPERTURA');
const primo = await db.delivery.findFirst({ where: { recurringService: { nome: NOME } }, orderBy: { date: 'asc' }, select: { date: true } });
const ultimo = await db.delivery.findFirst({ where: { recurringService: { nome: NOME } }, orderBy: { date: 'desc' }, select: { date: true } });
console.log(`  ${totale} consegne, dalla ${primo?.date.toISOString().slice(0, 10)} alla ${ultimo?.date.toISOString().slice(0, 10)}`);
console.log(`  mancano ancora: ${365 - totale}`);

console.log(`\n↩ cancellate ${await pulisci()} consegne di prova.`);
await db.$disconnect();

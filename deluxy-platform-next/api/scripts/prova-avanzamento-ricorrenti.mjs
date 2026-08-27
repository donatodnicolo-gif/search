/**
 * PROVA dell'avanzamento mostrato accanto ai ricorrenti (la rotellina).
 *
 * ⚠️ La prova che conta non è «dice in corso»: è che **si spenga** quando ha
 * finito. Una rotellina che gira per sempre è peggio di nessuna rotellina —
 * dice «aspetta» a chi non deve più aspettare niente.
 *
 * Ricorrente usa-e-getta, poi cancellato.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.BASE ?? 'http://localhost:3399/api/v1';
const SEGRETO = process.env.SEGRETO ?? 'segreto-solo-per-la-prova-locale';
const SEGRETO_CRON = 'cron-solo-per-la-prova-locale';
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url: `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=5` } } });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const testa = b64({ alg: 'HS256', typ: 'JWT' });
const admin = await db.user.findFirst({ where: { role: 'ADMIN', status: 'active' } });
const c = b64({ sub: admin.id, email: admin.email, role: admin.role, isSupport: admin.isSupport, partnerId: admin.partnerId, valetId: admin.valetId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
const token = `${testa}.${c}.${crypto.createHmac('sha256', SEGRETO).update(`${testa}.${c}`).digest('base64url')}`;

const NOME = 'PROVA-avanzamento-usa-e-getta';
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

const stato = async () => {
  const r = await fetch(`${BASE}/recurring-services`, { headers: { authorization: `Bearer ${token}` } });
  const d = await r.json().catch(() => []);
  return (Array.isArray(d) ? d : []).find((x) => x.nome === NOME)?.avanzamento;
};
const mostra = (e, a) => console.log(`  ${e.padEnd(34)} fatte ${String(a?.fatte).padStart(3)}/${String(a?.attese).padEnd(3)} · mancanti ${String(a?.mancanti).padStart(3)} · ROTELLINA: ${a?.inCorso ? '🔄 gira' : '⏹ ferma'}`);

const ps = await db.partnerService.findFirst({ where: { partner: { active: true } }, include: { partner: { select: { id: true } } } });
const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
const fine = new Date(`${oggi}T00:00:00Z`);
fine.setUTCDate(fine.getUTCDate() + 200);
const fineIso = fine.toISOString().slice(0, 10);

console.log(`ricorrente GIORNALIERO dal ${oggi} al ${fineIso} — 201 consegne\n`);
await fetch(`${BASE}/recurring-services`, {
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
mostra('appena salvato', await stato());

for (let giro = 1; giro <= 3; giro++) {
  await fetch(`${BASE}/cron/smistamento`, { headers: { authorization: `Bearer ${SEGRETO_CRON}` } });
  const a = await stato();
  mostra(`dopo il giro ${giro} del cron`, a);
  if (!a?.inCorso) break;
}

// ⚠️ Un servizio SOSPESO non è «in corso»: è fermo. Una rotellina su qualcosa
// che non sta lavorando manda a cercare un problema che non c'è.
const id = (await db.recurringService.findFirst({ where: { nome: NOME }, select: { id: true } })).id;
await db.recurringService.update({ where: { id }, data: { attivo: false, dataFine: new Date('2099-12-31') } });
mostra('sospeso (con orizzonte lungo)', await stato());
await db.recurringService.update({ where: { id }, data: { attivo: true } });

// ⚠️ E una consegna cancellata a mano non deve far ripartire la rotellina: la
// generazione non la rifà comunque (idempotente su servizio+data).
const una = await db.delivery.findFirst({ where: { recurringService: { nome: NOME } }, select: { id: true } });
await db.delivery.update({ where: { id: una.id }, data: { deletedAt: new Date() } });
await db.recurringService.update({ where: { id }, data: { dataFine: new Date(`${fineIso}T00:00:00Z`) } });
mostra('con una consegna cancellata', await stato());

console.log(`\n↩ cancellate ${await pulisci()} consegne di prova.`);
await db.$disconnect();

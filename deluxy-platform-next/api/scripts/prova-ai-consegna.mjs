/**
 * PROVA della rotta «compila con l'AI» in produzione.
 *
 * ⚠️ Che cosa si può provare e che cosa NO: senza una chiave Anthropic in
 * Impostazioni la chiamata vera al modello NON si può fare. Quello che si
 * misura qui è tutto il resto della catena — che la rotta esista, che sia
 * protetta, che validi il corpo, e che quando la chiave manca lo DICA invece
 * di rispondere un errore muto. Il 503 con scritto dove incollare la chiave è
 * l'esito atteso, non un fallimento.
 *
 * Il token si FIRMA con JWT_SECRET su un admin vero preso dal DB: nessuna
 * password passa di qui, e il token non si stampa mai.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.BASE ?? 'https://deluxy-delivery.vercel.app/api/v1';

const leggi = (file, chiave) => {
  const riga = fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${chiave}=`));
  return riga ? riga.slice(chiave.length + 1).trim().replace(/^"|"$/g, '') : null;
};

const u = new URL(leggi('C:/Users/nicol/app/deluxy-tasks/.env', 'DATABASE_URL'));
const db = new PrismaClient({
  datasources: {
    db: {
      url: `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1`,
    },
  },
});

const admin = await db.user.findFirst({ where: { role: 'ADMIN', status: 'active' } });
if (!admin) throw new Error('nessun admin attivo');
await db.$disconnect();

const segreto = process.env.SEGRETO ?? leggi('C:/Users/nicol/app/deluxy-platform-next/api/.env', 'JWT_SECRET');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const testa = b64({ alg: 'HS256', typ: 'JWT' });
const corpoTok = b64({
  sub: admin.id,
  email: admin.email,
  role: admin.role,
  isSupport: admin.isSupport,
  partnerId: admin.partnerId,
  valetId: admin.valetId,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 600,
});
const firma = crypto.createHmac('sha256', segreto).update(`${testa}.${corpoTok}`).digest('base64url');
const token = `${testa}.${corpoTok}.${firma}`;
console.log(`token firmato per l'admin ${admin.email} (non si stampa)\n`);

const chiama = async (corpo, conToken) => {
  const res = await fetch(`${BASE}/ai/consegna-da-testo`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(conToken ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(corpo),
  });
  return { stato: res.status, corpo: (await res.text()).slice(0, 280) };
};

console.log('1) senza token          →', JSON.stringify(await chiama({ testo: 'prova' }, false)));
console.log('2) corpo vuoto          →', JSON.stringify(await chiama({}, true)));
console.log('3) tipo immagine finto  →', JSON.stringify(await chiama({ testo: 'x', tipoImmagine: 'application/pdf' }, true)));
console.log(
  '4) testo vero           →',
  JSON.stringify(
    await chiama(
      {
        testo:
          'Domani alle 15 consegna a Maria Rossi, via Montenapoleone 12 Milano, citofono Rossi, 333 1234567, un bouquet, incassare 50 euro',
      },
      true,
    ),
  ),
);
const pubbliche = await fetch(`${BASE}/settings/public`, { headers: { authorization: `Bearer ${token}` } });
console.log('5) /settings/public     →', (await pubbliche.text()).replace(/"googleMapsBrowserKey":"[^"]*"/, '"googleMapsBrowserKey":"«nascosta»"').slice(0, 200));

// 6) Un VALET non deve poter chiamare: la rotta costa denaro a ogni chiamata.
const db2 = new PrismaClient({
  datasources: { db: { url: `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } },
});
const valet = await db2.user.findFirst({ where: { role: 'VALET', status: 'active' } });
await db2.$disconnect();
if (!valet) {
  console.log('6) valet → NON PROVATO: nessun valet attivo');
} else {
  const c = b64({ sub: valet.id, email: valet.email, role: valet.role, isSupport: valet.isSupport, partnerId: valet.partnerId, valetId: valet.valetId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 });
  const f = crypto.createHmac('sha256', segreto).update(`${testa}.${c}`).digest('base64url');
  const res = await fetch(`${BASE}/ai/consegna-da-testo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${testa}.${c}.${f}` },
    body: JSON.stringify({ testo: 'consegna a Mario Rossi domani' }),
  });
  console.log('6) come VALET           →', JSON.stringify({ stato: res.status, corpo: (await res.text()).slice(0, 160) }));
}

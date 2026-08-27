/**
 * UN PARTNER RIESCE A LEGGERE OLTRE IL PROPRIO?
 *
 * Due domande diverse, e la seconda è quella che conta:
 *  1. quali rotte gli rispondono;
 *  2. quando rispondono, restituiscono SOLO le sue cose?
 *
 * ⚠️ La prova che vale è quella con l'IDENTIFICATIVO DI UN ALTRO: una lista
 * che sembra filtrata può diventare aperta appena si chiede una riga per id.
 * È la trappola del confronto col proprio specchio — verificare che «vede i
 * suoi» non dimostra che «non vede gli altri».
 *
 * Sola lettura tranne una prova di scrittura, che viene disfatta.
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

// Un utente PARTNER vero, con consegne, e un ALTRO partner da usare come bersaglio.
// ⚠️ Serve un partner che abbia DAVVERO delle consegne: con zero righe la
// prova «vede solo le sue» è vera per costruzione e non dimostra niente — è
// il confronto col proprio specchio.
// Il partner con PIÙ consegne fra quelli che hanno un'utenza: la prova più
// probante è quella su chi ha più roba da isolare.
const conteggi = await db.delivery.groupBy({
  by: ['partnerId'], where: { deletedAt: null }, _count: { _all: true },
  orderBy: { _count: { partnerId: 'desc' } }, take: 40,
});
const utente = await db.user.findFirst({
  where: {
    role: 'PARTNER', status: 'active',
    partnerId: { in: conteggi.map((c) => c.partnerId).filter(Boolean) },
  },
  select: { id: true, email: true, role: true, isSupport: true, partnerId: true, valetId: true },
});
const mio = await db.partner.findUnique({ where: { id: utente.partnerId }, select: { id: true, insegna: true } });
const altro = await db.partner.findFirst({
  where: { active: true, id: { not: utente.partnerId }, deliveries: { some: { deletedAt: null } } },
  select: { id: true, insegna: true },
});
const consegnaAltrui = await db.delivery.findFirst({
  where: { partnerId: altro.id, deletedAt: null },
  select: { id: true, code: true },
});
const miaConsegna = await db.delivery.findFirst({
  where: { partnerId: mio.id, deletedAt: null },
  select: { id: true, code: true },
});
const unValet = await db.valet.findFirst({ where: { active: true }, select: { id: true, lastName: true } });

console.log(`partner di prova : ${mio.insegna}`);
console.log(`partner bersaglio: ${altro.insegna} (consegna #${consegnaAltrui?.code})\n`);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const testa = b64({ alg: 'HS256', typ: 'JWT' });
const c = b64({ ...utente, sub: utente.id, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 });
const token = `${testa}.${c}.${crypto.createHmac('sha256', SEGRETO).update(`${testa}.${c}`).digest('base64url')}`;

const chiama = async (metodo, percorso, corpo) => {
  const res = await fetch(`${BASE}${percorso}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const t = await res.text();
  let d = null; try { d = JSON.parse(t); } catch { d = t; }
  return { stato: res.status, dati: d, testo: t };
};
const mostra = (etichetta, r, nota = '') => {
  const m = r.testo.length > 300 ? `${(r.testo.length / 1024).toFixed(1)} KB` : String(r.testo).slice(0, 90).replace(/\s+/g, ' ');
  console.log(`  ${String(r.stato).padEnd(4)} ${etichetta.padEnd(48)} ${r.stato < 400 ? 'PASSA · ' + m : 'bloccata'} ${nota}`);
};

console.log('① CHE COSA GLI RISPONDE\n');
for (const p of ['/deliveries?pageSize=200', '/invoices/pending', '/invoices', '/customers', '/products',
                 '/sales', '/sms-templates', '/partners', '/valets', '/service-types',
                 '/salaries/pending', '/receipts', '/payments', '/finance/summary',
                 '/recurring-services', '/quotes', '/settings', '/users', '/deliveries/map']) {
  mostra(`GET ${p}`, await chiama('GET', p));
}

console.log('\n② E QUELLO CHE RISPONDE È SOLO SUO?\n');

// ⚠️ Si guarda anche lo STORICO: l'89% delle consegne è chiusa, e un partner
// con zero righe «attive» darebbe una prova vuota — che non dimostra nessun
// filtro, dimostra solo che non c'è niente da filtrare.
const attive = await chiama('GET', '/deliveries?pageSize=500&view=attive');
const storico = await chiama('GET', '/deliveries?pageSize=500&view=storico');
const righe = [...(attive.dati?.items ?? []), ...(storico.dati?.items ?? [])];
if (!righe.length) {
  console.log('  ⚠️ ZERO righe: la prova non dimostra niente. Serve un partner con consegne.');
}
const partnerNellaLista = new Set(righe.map((r) => r.partner?.id).filter(Boolean));
const altrui = [...partnerNellaLista].filter((x) => x !== mio.id);
console.log(`  consegne: ${righe.length} righe, ${partnerNellaLista.size} partner distinti · di altri: ${altrui.length} ${altrui.length === 0 ? '✔' : '✘'}`);

const fatt = await chiama('GET', '/invoices/pending');
const voci = fatt.dati?.voci ?? [];
const partnerInFatture = new Set(voci.map((v) => v.partnerId).filter(Boolean));
const fattureAltrui = [...partnerInFatture].filter((x) => x !== mio.id);
console.log(`  fatture da fare: ${voci.length} righe, ${partnerInFatture.size} partner · di altri: ${fattureAltrui.length} ${fattureAltrui.length === 0 ? '✔' : '✘'}`);
if (fatt.dati?.totali) {
  console.log(`    totali mostrati: venduto ${fatt.dati.totali.venduto} · dovuto ${fatt.dati.totali.dovutoAlPartner} · imponibile ${fatt.dati.totali.netAmount}`);
}

console.log('\n③ CHIEDENDO PER NOME E COGNOME LA ROBA DI UN ALTRO\n');
mostra(`GET /deliveries/<consegna di ${altro.insegna}>`, await chiama('GET', `/deliveries/${consegnaAltrui.id}`), '← deve dare 404/403');
mostra(`GET /deliveries/<una mia>`, await chiama('GET', `/deliveries/${miaConsegna.id}`), '← deve passare');
mostra(`GET /invoices/pending/<altro partner>`, await chiama('GET', `/invoices/pending/${altro.id}`), '← deve bloccare');
mostra(`GET /invoices/recap/<altro>?mese=2026-08`, await chiama('GET', `/invoices/recap/${altro.id}?mese=2026-08`), '← deve bloccare');
mostra(`GET /partners/<altro partner>`, await chiama('GET', `/partners/${altro.id}`), '← deve bloccare');
mostra(`GET /salaries/pending/<un valet>`, await chiama('GET', `/salaries/pending/${unValet.id}`), '← paghe: non lo riguarda');
mostra(`GET /salaries/recap/<un valet>`, await chiama('GET', `/salaries/recap/${unValet.id}`), '← paghe: non lo riguarda');
mostra(`GET /salaries/ricevuta/<un valet>`, await chiama('GET', `/salaries/ricevuta/${unValet.id}`), '← paghe: non lo riguarda');

console.log('\n④ E SE PROVA A SCRIVERE SULLA ROBA DI UN ALTRO\n');
const scrittura = await chiama('PATCH', `/deliveries/${consegnaAltrui.id}/status`, { status: 'cancelled' });
mostra(`PATCH /deliveries/<altrui>/status`, scrittura, '← deve bloccare');
if (scrittura.stato < 400) {
  console.log('  ⚠️⚠️ LA SCRITTURA E\' PASSATA: si rimette com\'era.');
  await db.delivery.update({ where: { id: consegnaAltrui.id }, data: { status: 'created' } });
}
const assegna = await chiama('PATCH', `/deliveries/${consegnaAltrui.id}/assign`, { valetId: unValet.id });
mostra(`PATCH /deliveries/<altrui>/assign`, assegna, '← deve bloccare');

await db.$disconnect();

/**
 * PROVA del giro completo delle chiavi app: si genera, si USA, si scade, si
 * rigenera, si spegne, si elimina.
 *
 * ⚠️ La chiave in chiaro non si stampa mai: si stampa solo la sua FORMA
 * (prefisso e lunghezza) e l'esito delle chiamate. Su questo repo si è già
 * pagato il mascherare per NOME invece che per forma.
 *
 * Lavora su una chiave usa-e-getta e la cancella. Non tocca quelle vere.
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
const chiama = async (metodo, percorso, token, corpo) => {
  const res = await fetch(`${BASE}${percorso}`, {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const t = await res.text();
  let d = null; try { d = JSON.parse(t); } catch { d = t; }
  return { stato: res.status, dati: d, testo: t };
};
const conChiave = async (percorso, chiave, metodo = 'GET', corpo) => {
  const res = await fetch(`${BASE}${percorso}`, {
    method: metodo,
    headers: { 'x-api-key': chiave, 'content-type': 'application/json' },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const t = await res.text();
  let d = null; try { d = JSON.parse(t); } catch { d = t; }
  return { stato: res.status, dati: d, testo: t };
};
const forma = (k) => `${k.slice(0, 4)}… (${k.length} caratteri)`;

const admin = await db.user.findFirst({ where: { role: 'ADMIN', status: 'active' } });
const valet = await db.user.findFirst({ where: { role: 'VALET', status: 'active' } });
const tA = tok(admin), tV = tok(valet);
const NOME = 'prova-usa-e-getta';
await db.appApiKey.deleteMany({ where: { nome: NOME } });

console.log('① SOLO L\'ADMIN GESTISCE LE CHIAVI\n');
console.log(`  valet → GET /chiavi-app        ${(await chiama('GET', '/chiavi-app', tV)).stato} (atteso 403)`);
const elenco = await chiama('GET', '/chiavi-app', tA);
console.log(`  admin → GET /chiavi-app        ${elenco.stato} · ${(elenco.dati ?? []).length} chiavi`);
const conHash = JSON.stringify(elenco.dati ?? []).includes('"hash"');
console.log(`  l'impronta esce nell'elenco?   ${conHash ? '✘ SÌ' : '✔ no'}`);

console.log('\n② SI GENERA, E IL VALORE SI VEDE UNA VOLTA SOLA\n');
const creata = await chiama('POST', '/chiavi-app', tA, {
  nome: NOME, scrittura: false, note: 'prova automatica, si cancella da sola',
});
const chiave = creata.dati?.chiave;
console.log(`  creazione ${creata.stato} · chiave ${chiave ? forma(chiave) : '(nessuna)'}`);
console.log(`  in archivio c'è il valore?     ${(await db.appApiKey.findFirst({ where: { nome: NOME }, select: { hash: true } }))?.hash === chiave ? '✘ SÌ' : '✔ no, solo l\'impronta'}`);
const riletta = (await chiama('GET', '/chiavi-app', tA)).dati?.find((k) => k.nome === NOME);
console.log(`  si può rileggere dall'elenco?  ${riletta && 'chiave' in riletta ? '✘ SÌ' : '✔ no'}`);

console.log('\n③ LA CHIAVE FUNZIONA DAVVERO\n');
const lettura = await conChiave('/app/consegne?limit=2', chiave);
console.log(`  GET /app/consegne (lettura)    ${lettura.stato} · ${(lettura.dati?.consegne ?? lettura.dati?.dati ?? []).length ?? 0} righe`);
// ⚠️ Il corpo dev'essere VALIDO, o il 400 della validazione nasconde l'esito
// del permesso: si leggerebbe «rifiutata» dove invece non si è mai arrivati al
// controllo. È lo stesso inganno già pagato su questo repo.
const psVero = await db.partnerService.findFirst({
  where: { partner: { active: true } },
  include: { partner: { select: { id: true } } },
});
const scrittura = await conChiave('/app/consegne', chiave, 'POST', {
  date: '2099-01-01',
  partnerId: psVero.partner.id,
  serviceTypeId: psVero.serviceTypeId,
  recipientFirstName: 'PROVA',
  recipientLastName: 'CHIAVE',
  recipientAddress: 'Piazza Duomo 1, 20121 Milano MI',
  recipientIntercom: 'p',
  deliveryTimeFrom: '10:00',
  pickupTimeFrom: '09:00',
});
console.log(`  POST /app/consegne, corpo VALIDO ${scrittura.stato} (atteso 401/403: è di sola lettura) · ${String(scrittura.dati?.message ?? '').slice(0, 70)}`);
// ⚠️ E si controlla in ARCHIVIO che non sia nata davvero: uno stato di rifiuto
// con la riga scritta sarebbe il peggiore degli esiti.
const nate = await db.delivery.count({ where: { recipientLastName: 'CHIAVE', date: new Date('2099-01-01T00:00:00.000Z') } });
console.log(`  consegne nate davvero          ${nate} ${nate === 0 ? '✔' : '✘'}`);

console.log('\n④ I RIFIUTI ATTESI\n');
const doppia = await chiama('POST', '/chiavi-app', tA, { nome: NOME });
console.log(`  stesso nome                    ${doppia.stato} · ${String(doppia.dati?.message ?? '').slice(0, 70)}`);
const nomeStorto = await chiama('POST', '/chiavi-app', tA, { nome: 'Nome Con Spazi!' });
console.log(`  nome con spazi e maiuscole     ${nomeStorto.stato} · ${String([].concat(nomeStorto.dati?.message ?? '')[0]).slice(0, 70)}`);
const scadenzaVecchia = await chiama('POST', '/chiavi-app', tA, { nome: 'prova-scaduta', scadeIl: '2020-01-01' });
console.log(`  scadenza già passata           ${scadenzaVecchia.stato} · ${String(scadenzaVecchia.dati?.message ?? '').slice(0, 70)}`);

console.log('\n⑤ LA SCADENZA FERMA DAVVERO LA CHIAVE\n');
await db.appApiKey.updateMany({ where: { nome: NOME }, data: { scadeIl: new Date(Date.now() - 3600_000) } });
const dopoScadenza = await conChiave('/app/consegne?limit=1', chiave);
console.log(`  con la scadenza passata        ${dopoScadenza.stato} · ${String(dopoScadenza.dati?.message ?? '').slice(0, 70)}`);
const inElenco = (await chiama('GET', '/chiavi-app', tA)).dati?.find((k) => k.nome === NOME);
console.log(`  l'elenco la dichiara scaduta?  ${inElenco?.scaduta ? '✔ sì' : '✘ no'}`);

console.log('\n⑥ SI RIGENERA: chiave nuova, la vecchia muore\n');
const id = (await db.appApiKey.findFirst({ where: { nome: NOME }, select: { id: true } })).id;
await db.appApiKey.update({ where: { id }, data: { scadeIl: null } });
const rigenerata = await chiama('POST', `/chiavi-app/${id}/rigenera`, tA, {});
const nuova = rigenerata.dati?.chiave;
console.log(`  rigenerazione ${rigenerata.stato} · nuova ${nuova ? forma(nuova) : '(nessuna)'} · diversa dalla vecchia: ${nuova !== chiave ? '✔' : '✘'}`);
console.log(`  la VECCHIA ora                 ${(await conChiave('/app/consegne?limit=1', chiave)).stato} (atteso 401)`);
console.log(`  la NUOVA ora                   ${(await conChiave('/app/consegne?limit=1', nuova)).stato} (atteso 200)`);

console.log('\n⑦ SI SPEGNE E SI ELIMINA\n');
await chiama('PATCH', `/chiavi-app/${id}`, tA, { attiva: false });
console.log(`  spenta → la chiave             ${(await conChiave('/app/consegne?limit=1', nuova)).stato} (atteso 401)`);
console.log(`  eliminazione                   ${(await chiama('DELETE', `/chiavi-app/${id}`, tA)).stato}`);
console.log(`  resta in archivio?             ${(await db.appApiKey.count({ where: { nome: NOME } })) ? '✘ sì' : '✔ no'}`);

await db.appApiKey.deleteMany({ where: { nome: { in: [NOME, 'prova-scaduta'] } } });
await db.$disconnect();

/**
 * PROVA di che cosa vede un TEAM LEADER, dal suo punto di vista.
 *
 * Segnalato dall'utente: «il team leader Cassoli vede solo Casati e Malia».
 * Qui si guarda la sua lista vera e la si confronta con quella dell'admin, per
 * il giorno in corso — e si controlla che NON veda cose fuori ambito.
 *
 * Sola lettura.
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
const lista = async (token, coda = '') => {
  const res = await fetch(`${BASE}/deliveries?pageSize=200&view=attive${coda}`, { headers: { authorization: `Bearer ${token}` } });
  const d = await res.json().catch(() => ({}));
  return { stato: res.status, righe: d?.items ?? [], totale: d?.total ?? 0 };
};

const capoUtente = await db.user.findFirst({ where: { email: 'renny705@gmail.com' } });
const admin = await db.user.findFirst({ where: { role: 'ADMIN', status: 'active' } });
const capo = await db.valet.findUnique({
  where: { id: capoUtente.valetId },
  select: { lastName: true, firstName: true, teamLeaderProvinces: true },
});
const provinceTl = JSON.parse(capo.teamLeaderProvinces ?? '[]');
const nomiProvince = await db.province.findMany({ where: { id: { in: provinceTl } }, select: { id: true, code: true } });
const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
console.log(`${capo.lastName} ${capo.firstName} · province di responsabilità: ${nomiProvince.map((p) => p.code).join(', ')}\n`);

const suo = await lista(tok(capoUtente), `&date=${oggi}`);
const uff = await lista(tok(admin), `&date=${oggi}`);
const partner = (righe) => {
  const m = new Map();
  for (const r of righe) m.set(r.partner?.insegna ?? '—', (m.get(r.partner?.insegna ?? '—') ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map(([n, q]) => `${n} (${q})`).join(', ');
};

console.log(`OGGI ${oggi}`);
console.log(`  l'ufficio vede      ${uff.righe.length} consegne: ${partner(uff.righe)}`);
console.log(`  il team leader vede ${suo.righe.length} consegne: ${partner(suo.righe)}`);
const senzaValet = suo.righe.filter((r) => !r.valet).length;
console.log(`  di cui ANCORA DA ASSEGNARE: ${senzaValet} ${senzaValet > 0 ? '✔ (prima erano invisibili)' : '✘'}`);

// ⚠️ La prova che conta non è «vede di più»: è «non vede quello che non deve».
const suoiId = new Set(provinceTl);
const idsSuoi = new Set(suo.righe.map((r) => r.id));
const fuoriAmbito = [];
for (const r of uff.righe) {
  if (idsSuoi.has(r.id)) continue;
  fuoriAmbito.push(r);
}
console.log(`\n  consegne dell'ufficio che il capo NON vede: ${fuoriAmbito.length}`);
for (const r of fuoriAmbito.slice(0, 6)) {
  const d = await db.delivery.findUnique({ where: { id: r.id }, select: { valetId: true, province: { select: { code: true, id: true } } } });
  const perche = d.valetId
    ? 'ha un valet fuori dalla sua squadra'
    : d.province
      ? (suoiId.has(d.province.id) ? '⚠️ SENZA VALET NELLE SUE PROVINCE — dovrebbe vederla' : `senza valet, provincia ${d.province.code} fuori ambito`)
      : 'senza valet e SENZA provincia riconosciuta';
  console.log(`    #${r.code} ${(r.partner?.insegna ?? '').padEnd(22)} ${perche}`);
}

// E che il filtro della richiesta non scavalchi l'ambito.
console.log('\n  il filtro della richiesta NON deve allargare l\'ambito:');
const altro = await db.partner.findFirst({
  where: { deliveries: { some: { deletedAt: null, valetId: null } }, id: { notIn: [...new Set(suo.righe.map((r) => r.partner?.id).filter(Boolean))] } },
  select: { id: true, insegna: true },
});
if (altro) {
  const forzato = await lista(tok(capoUtente), `&partnerId=${altro.id}`);
  console.log(`    ?partnerId=${altro.insegna} → ${forzato.righe.length} righe (deve mostrare solo quelle del suo ambito)`);
}
await db.$disconnect();

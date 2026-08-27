/**
 * PROVA di due cose, dal punto di vista di chi legge davvero:
 *  1. un valet NON deve vedere quanto paga il partner;
 *  2. un valet TEAM LEADER deve vedere anche la sua squadra.
 *
 * ⚠️ Sola lettura: chiama le rotte con token firmati per utenti veri e guarda
 * che cosa torna. Non scrive niente.
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
const tokenPer = (utente) => {
  const c = b64({
    sub: utente.id, email: utente.email, role: utente.role, isSupport: utente.isSupport,
    partnerId: utente.partnerId, valetId: utente.valetId,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900,
  });
  return `${testa}.${c}.${crypto.createHmac('sha256', SEGRETO).update(`${testa}.${c}`).digest('base64url')}`;
};
const chiedi = async (percorso, token) => {
  const res = await fetch(`${BASE}${percorso}`, { headers: { authorization: `Bearer ${token}` } });
  const t = await res.text();
  try { return { stato: res.status, dati: JSON.parse(t) }; } catch { return { stato: res.status, dati: t }; }
};

// ── il team leader vero segnalato dall'utente ─────────────────────────────
const capo = await db.user.findFirst({ where: { email: 'renny705@gmail.com' } });
const suoValet = await db.valet.findUnique({
  where: { id: capo.valetId },
  select: { lastName: true, firstName: true, isTeamLeader: true, teamLeaderProvinces: true },
});
console.log(`team leader: ${suoValet.lastName} ${suoValet.firstName} · isTeamLeader=${suoValet.isTeamLeader}`);
const provinceTl = JSON.parse(suoValet.teamLeaderProvinces ?? '[]');
console.log(`province di responsabilità dichiarate: ${provinceTl.length}`);

const squadra = await db.valet.findMany({
  where: { provinces: { some: { provinceId: { in: provinceTl } } } },
  select: { id: true },
});
console.log(`valet che lavorano in quelle province: ${squadra.length}`);

const t = tokenPer(capo);
const lista = await chiedi('/deliveries?pageSize=200&view=attive', t);
const righe = lista.dati?.items ?? [];
const valetDistinti = new Set(righe.map((r) => r.valet?.id).filter(Boolean));
console.log(`\n— la lista consegne che vede lui —`);
console.log(`  ${lista.stato}: ${righe.length} righe, di ${valetDistinti.size} valet diversi`);
console.log(`  ${valetDistinti.size > 1 ? '✔ vede la squadra' : '✘ vede solo sé stesso'}`);

// ── i soldi del partner non devono esserci ────────────────────────────────
console.log('\n— i soldi del partner nella risposta —');
const VIETATI = ['price', 'additionalPrice', 'deliveryPrice', 'flexiblePrice', 'extraKm', 'extraOutOfCity', 'billable', 'invoiced'];
const trovatiInLista = VIETATI.filter((k) => righe.some((r) => k in r));
console.log(`  nella LISTA: ${trovatiInLista.length ? '✘ ' + trovatiInLista.join(', ') : '✔ nessuno'}`);

const unaSua = righe[0];
if (unaSua) {
  const det = await chiedi(`/deliveries/${unaSua.id}`, t);
  const d = det.dati ?? {};
  const trovatiInDettaglio = VIETATI.filter((k) => k in d);
  console.log(`  nel DETTAGLIO #${d.code}: ${trovatiInDettaglio.length ? '✘ ' + trovatiInDettaglio.join(', ') : '✔ nessuno'}`);
  // Quello che DEVE vedere.
  const suoi = ['valetSalary', 'valetAdditionalPrice', 'paymentAmount', 'hours'].filter((k) => k in d);
  console.log(`  quello che deve vedere (paga, plus, contanti, ore): ${suoi.join(', ') || '✘ NIENTE'}`);
  const prodottiConPrezzo = (d.products ?? []).filter((p) => 'price' in p || 'publicPrice' in p).length;
  console.log(`  prodotti col prezzo di vendita: ${prodottiConPrezzo} ${prodottiConPrezzo === 0 ? '✔' : '✘'}`);
}

// ── un admin invece deve continuare a vederli ─────────────────────────────
const admin = await db.user.findFirst({ where: { role: 'ADMIN', status: 'active' } });
const listaAdmin = await chiedi('/deliveries?pageSize=5&view=attive', tokenPer(admin));
const rigaAdmin = (listaAdmin.dati?.items ?? [])[0];
console.log(`\n— l'admin non deve aver perso niente —`);
console.log(`  price nella sua lista: ${rigaAdmin && 'price' in rigaAdmin ? '✔ c\'è' : '✘ sparito'}`);

await db.$disconnect();

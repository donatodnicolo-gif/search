/**
 * PAGA DEL VALET UGUALE AI CHILOMETRI: QUANTO PESA, E COSA DIREBBE IL LISTINO (11/09/2026).
 *
 *   node api/scripts/paga-uguale-ai-km.mjs                 (tutto, riepilogo + primi casi)
 *   node api/scripts/paga-uguale-ai-km.mjs --csv           (scrive anche un CSV nello scratchpad)
 *   node api/scripts/paga-uguale-ai-km.mjs --mese 2026-08  (un mese solo)
 *   node api/scripts/paga-uguale-ai-km.mjs --valet <id>    (un valet solo)
 *
 * ⚠️⚠️ SCRIPT DI SOLA LETTURA. Non scrive niente, nemmeno con --applica: non esiste quell'opzione.
 * Serve a decidere, non a correggere (regola dell'utente dell'11/09: «nessuna scrittura senza via libera»).
 *
 * IL FATTO. Sulla consegna #62926 la paga del valet è 6,43 € e i chilometri sono 6,43: lo stesso numero.
 * Su 19.631 consegne che hanno sia paga sia chilometri, 1.351 hanno i due valori IDENTICI. Un'uguaglianza
 * così, ripetuta, somiglia a uno scambio di colonne nell'import dal sistema precedente — ma è un sospetto,
 * non una prova: il database legacy non è collegato a questo ambiente (esiste solo `api/.env.legacy.example`).
 *
 * COSA FA. Per ogni consegna sospetta rilegge, con le REGOLE DI STIPENDI (`pagaConsegna` +
 * `scegliListinoValet`, gli stessi che usa la pagina), quanto direbbe il listino del valet, e mette i due
 * numeri a confronto. Dichiara anche quando il listino NON sa rispondere (il valet non ha tariffa per quel
 * servizio): lì non c'è niente da ricalcolare, e va deciso a mano.
 *
 * COME LEGGERE L'ESITO.
 *  · «listino muto»     → nessuna tariffa per quel servizio: il ricalcolo non è possibile.
 *  · «combacia»         → il listino dice lo stesso numero: allora la paga è giusta e l'uguaglianza coi km è un caso.
 *  · «diverso»          → il listino dice un altro numero: è lì che si decide se correggere, e di quanto.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const ARG = process.argv.slice(2);
const val = (nome) => { const i = ARG.indexOf(nome); return i >= 0 ? ARG[i + 1] : null; };
const MESE = val('--mese');
const VALET = val('--valet');
const CSV = ARG.includes('--csv');

const RADICE = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';
const require = createRequire(RADICE + 'api/package.json');
const { PrismaClient } = require('@prisma/client');
// Le REGOLE VERE della paga, prese da dove vivono: nessuna copia, se no il confronto misura un'altra cosa.
const { pagaConsegna, scegliListinoValet } = require(RADICE + 'api/dist/salaries/salaries.module.js');

const riga = fs.readFileSync(RADICE + 'api/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });

const q2 = (n) => Math.round(n * 100) / 100;
const euro = (n) => (n == null ? '—' : `${q2(n).toFixed(2)} €`);

const dove = { valetSalary: { not: null }, deletedAt: null };
if (MESE) {
  const [a, m] = MESE.split('-').map(Number);
  dove.date = { gte: new Date(Date.UTC(a, m - 1, 1)), lt: new Date(Date.UTC(m === 12 ? a + 1 : a, m === 12 ? 0 : m, 1)) };
}
if (VALET) dove.valetId = VALET;

const consegne = await db.delivery.findMany({
  where: dove,
  select: {
    id: true, code: true, date: true, status: true, valetId: true, valetServiceId: true,
    valetSalary: true, valetAdditionalPrice: true, distanceKm: true, extraKm: true, extraOutOfCity: true,
    hours: true, payable: true,
    serviceType: { select: { name: true, pricingModel: true, minHours: true } },
    partner: { select: { insegna: true } },
    valet: { select: { id: true, firstName: true, lastName: true, minimumKmIncluded: true, extraOutOfCityPrice: true } },
    deliveryRule: { select: { name: true, toPay: true, valetPayAdjustment: true } },
    valetDeliveryRule: { select: { tiers: true, active: true } },
    _count: { select: { pickups: true } },
  },
  orderBy: { date: 'desc' },
});

// Sospette: paga e chilometri sono lo STESSO numero (entrambi > 0).
const sospette = consegne.filter((d) => (d.valetSalary ?? 0) > 0 && (d.distanceKm ?? 0) > 0 && q2(d.valetSalary) === q2(d.distanceKm));
console.log(`consegne con una paga scritta: ${consegne.length} · di cui paga = chilometri: ${sospette.length}`);
if (!sospette.length) { await db.$disconnect(); process.exit(0); }

// I listini dei valet coinvolti, in una lettura sola (il pool ha poche connessioni: niente query per riga).
const valetIds = [...new Set(sospette.map((d) => d.valetId).filter(Boolean))];
const listini = await db.valetService.findMany({
  where: { valetId: { in: valetIds } },
  include: { serviceType: { select: { pricingModel: true, minHours: true } } },
  orderBy: [{ validFrom: 'desc' }],
});
const perId = new Map(listini.map((l) => [l.id, l]));
const perValet = new Map();
for (const l of listini) { const a = perValet.get(l.valetId) ?? []; a.push(l); perValet.set(l.valetId, a); }

const righe = [];
for (const d of sospette) {
  const listino = scegliListinoValet(d, perId, perValet);
  // ⚠️⚠️ LA PAGA SCRITTA VA TOLTA PRIMA DI CHIEDERE AL LISTINO. `pagaConsegna` dà la precedenza a
  // `valetSalary` (torna `origine: consegna`): passandogliela, il confronto direbbe sempre «combacia»
  // e non misurerebbe niente. Qui si azzera, così il listino parla davvero.
  const senzaPaga = { ...d, valet: d.valet, valetSalary: null };
  const calcolo = listino ? pagaConsegna(senzaPaga, listino, d.deliveryRule ?? null, d.valetDeliveryRule ?? null, d._count?.pickups ?? 0) : null;
  const dal = calcolo?.amount ?? null;
  righe.push({
    code: d.code,
    giorno: d.date.toISOString().slice(0, 10),
    mese: d.date.toISOString().slice(0, 7),
    valet: `${d.valet?.lastName ?? ''} ${d.valet?.firstName ?? ''}`.trim() || '—',
    partner: d.partner?.insegna ?? '—',
    servizio: d.serviceType?.name ?? '—',
    modello: d.serviceType?.pricingModel ?? '—',
    scritta: q2(d.valetSalary),
    km: q2(d.distanceKm),
    dalListino: dal,
    esito: dal == null ? 'listino muto' : (q2(dal) === q2(d.valetSalary) ? 'combacia' : 'diverso'),
    differenza: dal == null ? null : q2(dal - d.valetSalary),
    stato: d.status,
  });
}

const conta = (e) => righe.filter((r) => r.esito === e);
const muti = conta('listino muto'); const combaciano = conta('combacia'); const diversi = conta('diverso');
const somma = (a, f) => q2(a.reduce((s, x) => s + (f(x) ?? 0), 0));

console.log('');
console.log('ESITO DEL CONFRONTO COL LISTINO DEL VALET');
console.log(`  listino muto (nessuna tariffa per quel servizio): ${muti.length} · pagato ${euro(somma(muti, (r) => r.scritta))}`);
console.log(`  combacia (il listino dice lo stesso numero):      ${combaciano.length} · pagato ${euro(somma(combaciano, (r) => r.scritta))}`);
console.log(`  diverso (il listino dice un altro numero):        ${diversi.length} · pagato ${euro(somma(diversi, (r) => r.scritta))} · direbbe ${euro(somma(diversi, (r) => r.dalListino))} · differenza ${euro(somma(diversi, (r) => r.differenza))}`);

const perMese = new Map();
for (const r of righe) { const m = perMese.get(r.mese) ?? { n: 0, muti: 0, combacia: 0, diverso: 0 }; m.n++; m[r.esito === 'listino muto' ? 'muti' : r.esito === 'combacia' ? 'combacia' : 'diverso']++; perMese.set(r.mese, m); }
console.log('');
console.log('PER MESE (totale · muto/combacia/diverso)');
for (const [m, v] of [...perMese.entries()].sort().reverse()) console.log(`  ${m}: ${v.n} · ${v.muti}/${v.combacia}/${v.diverso}`);

const perValetConta = new Map();
for (const r of righe) perValetConta.set(r.valet, (perValetConta.get(r.valet) ?? 0) + 1);
console.log('');
console.log('PRIMI VALET PER NUMERO DI CASI');
for (const [v, n] of [...perValetConta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${v}: ${n}`);

console.log('');
console.log('PRIMI 15 CASI «DIVERSO» (dove il ricalcolo cambierebbe qualcosa)');
for (const r of diversi.slice(0, 15)) {
  console.log(`  #${r.code} ${r.giorno} ${r.valet} · ${r.servizio} [${r.modello}] · scritta ${euro(r.scritta)} = km ${r.km} · listino ${euro(r.dalListino)} (${r.differenza > 0 ? '+' : ''}${r.differenza} €)`);
}
if (muti.length) {
  console.log('');
  console.log('PRIMI 10 CASI «LISTINO MUTO» (nessuna tariffa: decide una persona)');
  for (const r of muti.slice(0, 10)) console.log(`  #${r.code} ${r.giorno} ${r.valet} · ${r.servizio} [${r.modello}] · scritta ${euro(r.scritta)} = km ${r.km}`);
}

if (CSV) {
  const file = 'C:/Users/nicol/AppData/Local/Temp/claude/C--Users-nicol-AppData-Roaming-Claude-scratch-workspaces-147c2d07-6f07-4f76-a9a0-aeb8b68597b4-5aea5d1f-2b97-4519-b0f3-b221e77fe9fe-scratch-2026-09-10-939f73/eaf84fac-308a-4053-a4c4-893e7fde17a2/scratchpad/paga-uguale-ai-km.csv';
  const testa = 'consegna;data;valet;partner;servizio;modello;paga scritta;km;dal listino;esito;differenza;stato';
  const corpo = righe.map((r) => [r.code, r.giorno, r.valet, r.partner, r.servizio, r.modello, r.scritta, r.km, r.dalListino ?? '', r.esito, r.differenza ?? '', r.stato].join(';'));
  fs.writeFileSync(file, [testa, ...corpo].join('\r\n'), 'utf8');
  console.log('');
  console.log('CSV scritto in', file);
}

console.log('');
console.log('⚠️ Nessuna scrittura fatta: questo script legge e basta.');
await db.$disconnect();

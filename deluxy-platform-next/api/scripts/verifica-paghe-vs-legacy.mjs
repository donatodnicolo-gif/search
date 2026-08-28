/**
 * LE PAGHE DEI VALET SONO QUELLE DEL DATABASE ORIGINALE? (28/08/2026)
 *
 * Due controlli, perché sono due cose diverse:
 *
 *  1. **La paga scritta sulla CONSEGNA** — `Delivery.valetSalary` contro
 *     `delivery.expertSalary` del legacy. È il numero che finisce nello
 *     stipendio: se diverge, si paga una cifra che nessuno ha deciso.
 *
 *  2. **Il LISTINO del valet** — `ValetService.salary`/`extraKmPrice` contro
 *     `expert-service.salary`/`minimumKmPrice`. È il numero da cui la paga si
 *     ricalcola quando sulla consegna non c'è.
 *
 * ⚠️ Il catalogo dei servizi VALET è `tabella-38`, **non** `service.csv`: quello
 * è dei partner e usa gli stessi numeri per cose diverse (l'id 5 è «Servizio
 * Consegna Standard» a prezzo fisso fra i partner e «Servizio a Ora» fra i
 * valet). Leggere il catalogo sbagliato produce un'accusa coerente e falsa.
 *
 * ⚠️ Il confronto del listino si fa per INSIEME di righe, non riga per riga:
 * `ValetService` non conserva l'id legacy, quindi l'unico appaiamento onesto è
 * «il valet ha le stesse tariffe sugli stessi servizi».
 *
 * Non scrive niente.
 */
import fs from 'node:fs';
import path from 'node:path';

const TAB = 'C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle';
function leggi(nome) {
  const file = path.join(TAB, `${nome}.csv`);
  if (!fs.existsSync(file)) return [];
  const testo = fs.readFileSync(file, 'utf8');
  const righe = [];
  let riga = [], campo = '', inStr = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (inStr) {
      if (c === '"' && testo[i + 1] === '"') { campo += '"'; i++; continue; }
      if (c === '"') { inStr = false; continue; }
      campo += c; continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === ',') { riga.push(campo); campo = ''; continue; }
    if (c === '\n') { riga.push(campo); righe.push(riga); riga = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo || riga.length) { riga.push(campo); righe.push(riga); }
  const testa = righe.shift();
  return righe.map((r) => Object.fromEntries(testa.map((k, i) => [k, r[i]])));
}

const rigaEnv = fs
  .readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=5`;
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();

const q2 = (v) => (v == null || v === '' || v === 'NULL' ? null : Math.round(Number(v) * 100) / 100);

// ------------------------------------------------------------------
// 1. La paga scritta sulle consegne.
// ------------------------------------------------------------------
console.log('='.repeat(70));
console.log('1. LA PAGA SCRITTA SULLA CONSEGNA  (valetSalary ↔ expertSalary)');
console.log('='.repeat(70));
const legacy = new Map(leggi('delivery').map((x) => [Number(x.id), x]));
const nostre = await p.delivery.findMany({
  where: { legacyId: { not: null }, deletedAt: null },
  select: { legacyId: true, code: true, valetSalary: true, valetAdditionalPrice: true },
});
let uguali = 0, diverse = 0, scarto = 0;
const esempi = [];
for (const n of nostre) {
  const L = legacy.get(n.legacyId);
  if (!L) continue;
  const a = q2(L.expertSalary);
  const b = q2(n.valetSalary);
  if (a === b || (a == null && b == null)) { uguali++; continue; }
  diverse++;
  scarto += Math.abs((a ?? 0) - (b ?? 0));
  if (esempi.length < 10) esempi.push(`#${n.code}  legacy ${a}  piattaforma ${b}`);
}
console.log(`consegne confrontate : ${nostre.length}`);
console.log(`  paga UGUALE        : ${uguali}`);
console.log(`  paga DIVERSA       : ${diverse}` + (diverse ? `  (scarto ${scarto.toFixed(2)} €)` : ''));
if (esempi.length) console.log('  esempi:\n    ' + esempi.join('\n    '));

// Il plus/minus, che è l'altro addendo.
let pmDiversi = 0;
for (const n of nostre) {
  const L = legacy.get(n.legacyId);
  if (!L) continue;
  if (q2(L.valetAdditionalPrice) !== q2(n.valetAdditionalPrice)) pmDiversi++;
}
console.log(`  plus/minus DIVERSO : ${pmDiversi}`);

// ------------------------------------------------------------------
// 2. Il listino del valet.
// ------------------------------------------------------------------
console.log('\n' + '='.repeat(70));
console.log('2. IL LISTINO DEL VALET  (salary/extraKm ↔ expert-service)');
console.log('='.repeat(70));
const catalogo = new Map(leggi('tabella-38').map((x) => [x.id, x]));
const modello = { fixedpricesalary: 'PREZZO_FISSO', hourlyratesalary: 'A_ORA', warehousesalary: 'MAGAZZINO' };
const esLegacy = leggi('expert-service').filter((x) => !x.deletedAt || x.deletedAt === 'NULL' || x.deletedAt === '');

const valet = await p.valet.findMany({
  where: { legacyId: { not: null } },
  select: { id: true, legacyId: true, firstName: true, lastName: true, extraOutOfCityPrice: true },
});
const perLegacyId = new Map(valet.map((v) => [String(v.legacyId), v]));
const listino = await p.valetService.findMany({
  select: { valetId: true, salary: true, extraKmPrice: true, serviceType: { select: { name: true, pricingModel: true } } },
});
const perValet = new Map();
for (const r of listino) {
  if (!perValet.has(r.valetId)) perValet.set(r.valetId, []);
  perValet.get(r.valetId).push(r);
}

let righeUguali = 0, righeMancanti = 0, righeDiverse = 0;
const casi = [];
for (const L of esLegacy) {
  const v = perLegacyId.get(L.expertId);
  if (!v) continue;
  const sv = catalogo.get(L.serviceId);
  const atteso = { modello: modello[sv?.serviceType] ?? sv?.serviceType, salary: q2(L.salary), km: q2(L.minimumKmPrice) };
  const candidate = (perValet.get(v.id) ?? []).filter((x) => x.serviceType?.pricingModel === atteso.modello);
  if (!candidate.length) {
    righeMancanti++;
    if (casi.length < 10) casi.push(`${(v.firstName + ' ' + v.lastName).padEnd(24)} «${sv?.serviceName}» ASSENTE in piattaforma`);
    continue;
  }
  const uguale = candidate.find((x) => q2(x.salary) === atteso.salary && q2(x.extraKmPrice) === atteso.km);
  if (uguale) { righeUguali++; continue; }
  righeDiverse++;
  if (casi.length < 10) {
    const c = candidate[0];
    casi.push(`${(v.firstName + ' ' + v.lastName).padEnd(24)} «${sv?.serviceName}»  legacy salary ${atteso.salary} km ${atteso.km}  →  piattaforma salary ${q2(c.salary)} km ${q2(c.extraKmPrice)}`);
  }
}
console.log(`righe di listino nel legacy : ${esLegacy.length}`);
console.log(`  IDENTICHE (importo e km)  : ${righeUguali}`);
console.log(`  DIVERSE                   : ${righeDiverse}`);
console.log(`  assenti in piattaforma    : ${righeMancanti}`);
if (casi.length) console.log('  casi:\n    ' + casi.join('\n    '));

// ------------------------------------------------------------------
// 3. La tariffa fuori città, che è quella che paga davvero i km.
// ------------------------------------------------------------------
console.log('\n' + '='.repeat(70));
console.log('3. LA TARIFFA FUORI CITTÀ  (extraOutOfCityPrice ↔ extraOutSideCityKmPrice)');
console.log('='.repeat(70));
const expert = new Map(leggi('expert').map((x) => [x.id, x]));
let fcUguali = 0, fcDiversi = 0;
const fcCasi = [];
for (const v of valet) {
  const L = expert.get(String(v.legacyId));
  if (!L) continue;
  const a = q2(L.extraOutSideCityKmPrice);
  const b = q2(v.extraOutOfCityPrice);
  if (a === b || (a == null && b === 0) || (a === 0 && b == null)) { fcUguali++; continue; }
  fcDiversi++;
  if (fcCasi.length < 10) fcCasi.push(`${(v.firstName + ' ' + v.lastName).padEnd(24)} legacy ${a}  piattaforma ${b}`);
}
console.log(`  UGUALE  : ${fcUguali}`);
console.log(`  DIVERSA : ${fcDiversi}`);
if (fcCasi.length) console.log('  casi:\n    ' + fcCasi.join('\n    '));

await p.$disconnect();

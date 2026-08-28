/**
 * IL LISTINO DEI VALET È AGGANCIATO AL SERVIZIO GIUSTO? (28/08/2026)
 *
 * Nel legacy il listino di un valet è `expert-service`: una riga per
 * (expert, service) con `salary` e `minimumKmPrice`. In piattaforma è
 * `ValetService`, che però **non conserva l'id legacy della riga**: il legame
 * con l'originale è perso, e l'import ha creato dei `ServiceType` propri
 * (`legacyId` 9000xx, `scope = 'valet'`).
 *
 * ⚠️⚠️ IL CATALOGO DEI SERVIZI VALET È `tabella-38`, NON `service`.
 * `service.csv` è il catalogo dei servizi **partner**, e i due usano gli stessi
 * numeri per cose diverse: l'id 5 è «Servizio Consegna Standard» (prezzo fisso)
 * fra i partner e «Servizio a Ora» (a ora) fra i valet. Leggendo il catalogo
 * sbagliato questo script accusava l'import di aver spostato 107 righe da un
 * modello di prezzo all'altro: **falso**, l'import è corretto.
 *
 * È la stessa trappola già pagata sul Corporate: una misura sulla tabella
 * sbagliata produce un'accusa perfettamente coerente e completamente falsa.
 *
 * Questo script MISURA e basta: non scrive niente. Confronta, valet per valet,
 * le righe del legacy con quelle della piattaforma, appaiandole per importo.
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

// Il catalogo dei servizi VALET (vedi l'avviso in testa): tabella-38.
const servizi = new Map(leggi('tabella-38').map((x) => [x.id, x]));
const esLegacy = leggi('expert-service').filter((x) => !x.deletedAt || x.deletedAt === 'NULL' || x.deletedAt === '');

const valet = await p.valet.findMany({
  where: { legacyId: { not: null } },
  select: { id: true, legacyId: true, firstName: true, lastName: true, active: true },
});
const perLegacy = new Map(valet.map((v) => [String(v.legacyId), v]));

const nostre = await p.valetService.findMany({
  select: { id: true, valetId: true, salary: true, extraKmPrice: true, serviceType: { select: { name: true, pricingModel: true, legacyId: true } } },
});
const perValet = new Map();
for (const r of nostre) {
  if (!perValet.has(r.valetId)) perValet.set(r.valetId, []);
  perValet.get(r.valetId).push(r);
}

let appaiate = 0, modelloUguale = 0, modelloDiverso = 0, senzaServizioLegacy = 0, senzaRiscontro = 0;
const casi = [];
// I tipi del catalogo VALET hanno il suffisso «salary»: sono un vocabolario
// suo, non quello dei partner.
const modelloLegacy = {
  fixedpricesalary: 'PREZZO_FISSO',
  hourlyratesalary: 'A_ORA',
  warehousesalary: 'MAGAZZINO',
};

for (const L of esLegacy) {
  const v = perLegacy.get(L.expertId);
  if (!v) continue;
  const nostreDelValet = perValet.get(v.id) ?? [];
  // Si appaiano per IMPORTO: e' l'unico aggancio rimasto, visto che le righe
  // non portano piu' il loro id legacy.
  const stesso = nostreDelValet.filter((x) => Math.abs((x.salary ?? 0) - Number(L.salary ?? 0)) < 0.001);
  if (!stesso.length) { senzaRiscontro++; continue; }
  appaiate++;
  const svL = servizi.get(L.serviceId);
  if (!svL) { senzaServizioLegacy++; continue; }
  const atteso = modelloLegacy[svL.serviceType] ?? svL.serviceType;
  const ok = stesso.some((x) => x.serviceType?.pricingModel === atteso);
  if (ok) modelloUguale++;
  else {
    modelloDiverso++;
    if (casi.length < 12) {
      casi.push(
        `${(v.firstName + ' ' + v.lastName).padEnd(24)} salary ${String(L.salary).padStart(6)}  legacy «${svL.serviceName}» (${atteso})  →  piattaforma «${stesso.map((x) => x.serviceType?.name).join('/')}» (${stesso.map((x) => x.serviceType?.pricingModel).join('/')})`,
      );
    }
  }
}

console.log('righe di listino nel legacy (non cancellate):', esLegacy.length);
console.log('  appaiate a una riga della piattaforma (per importo):', appaiate);
console.log('  senza riscontro in piattaforma                     :', senzaRiscontro);
console.log('  il cui servizio LEGACY non esiste piu\'             :', senzaServizioLegacy);
console.log('  modello di prezzo UGUALE                           :', modelloUguale);
console.log('  modello di prezzo DIVERSO                          :', modelloDiverso);
if (casi.length) console.log('\nesempi di modello diverso:\n  ' + casi.join('\n  '));

// Quanto pesa: le consegne pagate con un listino il cui modello e' cambiato.
const perModello = await p.$queryRawUnsafe(`
  SELECT s.name, s."pricingModel", count(*)::int AS righe, sum(vs.salary)::float AS somma
  FROM platform."ValetService" vs
  JOIN platform."ServiceType" s ON s.id = vs."serviceTypeId"
  GROUP BY 1, 2 ORDER BY 3 DESC`);
console.log('\nRighe di listino in piattaforma, per servizio:');
for (const r of perModello) console.log(`  ${String(r.name).padEnd(30)} ${String(r.pricingModel).padEnd(14)} ${String(r.righe).padStart(4)} righe`);

await p.$disconnect();

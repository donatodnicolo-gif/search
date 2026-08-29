/**
 * RIAGGANCIA I LISTINI VALET ORFANI.
 *
 * ⚠️ 4.202 consegne puntano, con `valetServiceId`, a righe di `ValetService`
 * che NON esistono più: sono 4 soli id, resti di listini cancellati e ricreati
 * da un import successivo. Senza listino la paga non è ricalcolabile e vale
 * solo il numero scritto sulla consegna — sul #58899 sono 20,00 € contro i
 * 25,00 (2 h × 12,50) che il legacy ha davvero pagato.
 *
 * La chiave: 'delivery.expertServiceId' del CSV legacy -> la riga di
 * expert-service (expertId + serviceId) -> il listino di QUEL valet per QUEL
 * servizio del catalogo VALET (ServiceType con legacyId 900000+serviceId).
 * ATTENZIONE: NON si passa per ValetService.legacyId (quelle righe sono state
 * ricreate da un import successivo e l'id legacy non ce l'hanno piu': proprio
 * i 4 che servono no), ne' per il serviceTypeId della consegna (quello e' il
 * servizio del PARTNER: due tassonomie che riusano gli stessi numeri).
 *
 * Simula di default. Scrive solo con `--applica`, e prima salva il valore
 * vecchio in `scripts/backup-listini-valet.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const APPLICA = process.argv.includes('--applica');
// I CSV stanno nella cartella dell'app, non in api/: si risolvono dal file
// dello script, così funziona da qualunque cartella si lanci.
// I CSV stanno nella cartella dell'app, non in api/: si risolvono dal file
// dello script, cosi' funziona da qualunque cartella si lanci.
const TABELLE = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'legacy', 'tabelle');

function leggi(nome) {
  const file = path.join(TABELLE, `${nome}.csv`);
  if (!fs.existsSync(file)) throw new Error(`CSV mancante: ${file}`);
  const testo = fs.readFileSync(file, 'utf8');
  const righe = []; let riga = [], campo = '', inStr = false;
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
  if (campo !== '' || riga.length) { riga.push(campo); righe.push(riga); }
  const testa = righe[0].map((x) => x.trim());
  return righe.slice(1).filter((r) => r.some((v) => v !== ''))
    .map((r) => Object.fromEntries(testa.map((c, i) => [c, r[i]])));
}
const num = (v) => {
  const t = String(v ?? '').trim();
  return t === '' || t === 'NULL' ? null : Number(t);
};

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:${u.port || 5432}/postgres?schema=platform&pgbouncer=true`;
const prisma = new PrismaClient();

// legacyId consegna -> expertServiceId
const legacy = new Map();
for (const r of leggi('delivery')) {
  const id = num(r.id), es = num(r.expertServiceId);
  if (id != null && es != null) legacy.set(id, es);
}
console.log('CSV legacy: consegne con expertServiceId =', legacy.size);

// expert-service del legacy: id -> (expertId, serviceId)
const expertService = new Map();
for (const r of leggi('expert-service')) {
  const id = num(r.id);
  if (id != null) expertService.set(id, { expertId: num(r.expertId), serviceId: num(r.serviceId) });
}
const valets = await prisma.valet.findMany({ where: { legacyId: { not: null } }, select: { id: true, legacyId: true } });
const perValetLegacy = new Map(valets.map((v) => [v.legacyId, v.id]));
const tipiValet = await prisma.serviceType.findMany({ where: { legacyId: { gte: 900000 } }, select: { id: true, legacyId: true, name: true, pricingModel: true } });
const perTipoLegacy = new Map(tipiValet.map((t) => [t.legacyId - 900000, t]));
const listini = await prisma.valetService.findMany({
  select: { id: true, valetId: true, serviceTypeId: true, salary: true,
    serviceType: { select: { name: true, pricingModel: true } } },
});
const perCoppia = new Map(listini.map((l) => [l.valetId + '|' + l.serviceTypeId, l]));
console.log('expert-service nel legacy:', expertService.size, '| listini valet:', listini.length, '| tipi catalogo valet:', tipiValet.length);

// consegne con riferimento orfano
const orfane = await prisma.$queryRawUnsafe(`
  SELECT d.id, d.code, d."legacyId", d."valetId", d."valetServiceId", d."valetSalary", d.hours,
         d.payable, d."paymentStatus", d.status
  FROM platform."Delivery" d
  LEFT JOIN platform."ValetService" vs ON vs.id = d."valetServiceId"
  WHERE d."deletedAt" IS NULL AND d."valetServiceId" IS NOT NULL AND vs.id IS NULL
`);
console.log('consegne con listino orfano:', orfane.length);

const daPagare = (o) => o.payable && o.paymentStatus !== 'paid'
  && ['delivered', 'approved', 'not_delivered'].includes(o.status);

let senzaLegacy = 0, senzaExpert = 0, senzaRigaLegacy = 0, senzaListino = 0, valetDiverso = 0;
const cambi = [];
for (const o of orfane) {
  if (o.legacyId == null) { senzaLegacy++; continue; }
  const es = legacy.get(o.legacyId);
  if (es == null) { senzaExpert++; continue; }
  const r = expertService.get(es);
  if (!r) { senzaRigaLegacy++; continue; }
  const valetId = perValetLegacy.get(r.expertId);
  const tipo = perTipoLegacy.get(r.serviceId);
  if (!valetId || !tipo) { senzaListino++; continue; }
  const l = perCoppia.get(valetId + "|" + tipo.id);
  if (!l) { senzaListino++; continue; }
  // Il listino e di UN valet: se non e quello della consegna il legame sarebbe
  // inventato. Meglio lasciarla orfana che agganciarla al listino di un altro.
  if (valetId !== o.valetId) { valetDiverso++; continue; }
  cambi.push({ id: o.id, code: o.code, da: o.valetServiceId, a: l.id,
    listino: l.serviceType?.name, modello: l.serviceType?.pricingModel,
    tariffa: l.salary, pagaScritta: o.valetSalary, ore: o.hours, daPagare: daPagare(o) });
}

console.log('--- esito della prova ---');
console.log('riagganciabili:', cambi.length);
console.log('  di cui ANCORA DA PAGARE:', cambi.filter((c) => c.daPagare).length);
console.log('scartate -> senza legacyId:', senzaLegacy, '| senza expertServiceId:', senzaExpert, '| riga expert-service assente:', senzaRigaLegacy, '| listino non ricostruibile:', senzaListino, '| listino di un ALTRO valet:', valetDiverso);

// che cosa cambierebbe nelle paghe ancora da pagare
const conf = cambi.filter((c) => c.daPagare).map((c) => {
  const attesa = c.modello === 'A_ORA' ? (c.tariffa ?? 0) * (c.ore || 0) : (c.tariffa ?? 0);
  return { ...c, attesa, scarto: attesa - (c.pagaScritta ?? 0) };
});
const diverse = conf.filter((c) => Math.abs(c.scarto) > 0.01);
console.log('paghe da pagare che il listino calcolerebbe DIVERSE:', diverse.length,
  '| scarto totale:', diverse.reduce((s, c) => s + c.scarto, 0).toFixed(2), 'EUR');
for (const c of diverse.slice(0, 8)) {
  console.log(`   #${c.code} ${c.listino} (${c.modello}) tariffa ${c.tariffa} ore ${c.ore} → scritta ${c.pagaScritta} vs listino ${c.attesa.toFixed(2)}`);
}

if (!APPLICA) {
  console.log('\nPROVA A VUOTO: niente scritto. Rilancia con --applica per riagganciare.');
} else {
  fs.writeFileSync(path.join('scripts', 'backup-listini-valet.json'),
    JSON.stringify(cambi.map((c) => ({ id: c.id, code: c.code, valetServiceId: c.da })), null, 2));
  let fatte = 0;
  for (const c of cambi) {
    await prisma.delivery.update({ where: { id: c.id }, data: { valetServiceId: c.a } });
    fatte++;
    if (fatte % 500 === 0) console.log('  riagganciate', fatte);
  }
  console.log('RIAGGANCIATE:', fatte, '(backup in scripts/backup-listini-valet.json)');
}
await prisma.$disconnect();

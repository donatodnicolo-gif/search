// Archivia i prodotti che non compaiono in una consegna DA INIZIO 2025.
//
// La finestra e' una DATA FISSA, non «gli ultimi due anni». Sembra la stessa
// cosa e non lo e': provate tutte e due sui dati veri, davano risposte diverse
// su 202 prodotti. 199 hanno una consegna fra agosto e dicembre 2024 — dentro
// la finestra mobile, fuori da quella civile. L'utente ha scelto la civile:
// «da inizio 2025».
//
// ⚠️ Le consegne FUTURE contano. Un prodotto con una consegna gia' fissata fra
// due mesi e' in uso, non fermo: guardare solo il passato lo archivierebbe il
// giorno prima di doverlo preparare. (Le date impossibili del legacy — anno
// 0202 e 0206 — restano fuori da sole, perche' sono precedenti al 2025.)
//
// ⚠️ Il ripescaggio tocca SOLO i prodotti archiviati da questa regola
// (`archivedReason`). Quelli che una persona ha archiviato a mano, o che sono
// finiti in archivio perche' il loro partner e' spento, restano dove sono: un
// automatismo che disfa una decisione umana e' peggio di nessun automatismo.
//
// ⚠️ 30 GIORNI DI GRAZIA sui prodotti appena creati: un prodotto nato ieri non
// si giudica sul passato che non ha.
//
// Lo stato finale va a Merchandising, nel suo campo `statoPiattaforma` — che
// non e' la `fase` del PLM.
//
// Di default non scrive. Con --scrivi applica.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const SCRIVI = process.argv.includes('--scrivi');
const DA = process.argv.find((a) => a.startsWith('--da='))?.split('=')[1] ?? '2025-01-01';
const GRAZIA = 30;
const MOTIVO = `nessuna-consegna-dal-${DA}`;
// Anche i nomi delle regole precedenti: sono sempre archiviazioni mie, e
// vanno riconosciute per poterle disfare.
const MOTIVI_MIEI = [MOTIVO, 'mai-consegnato-2025-2026', 'fermo-da-2-anni'];

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

// Chi ha visto almeno una consegna dalla data in poi. Nessun limite in alto:
// una consegna futura e' un prodotto in uso.
const vivi = await db.$queryRawUnsafe(`
  select distinct dp."productId" id
    from "platform"."DeliveryProduct" dp
    join "platform"."Delivery" d on d.id = dp."deliveryId"
   where d.date >= $1::timestamp`, DA);
const idVivi = new Set(vivi.map((x) => x.id));

const tutti = await db.product.findMany({
  select: { id: true, sku: true, name: true, archived: true, archivedReason: true, createdAt: true },
});
const limiteGrazia = new Date(Date.now() - GRAZIA * 864e5);

const daArchiviare = [], daRipescare = [];
for (const p of tutti) {
  const vivo = idVivi.has(p.id);
  if (!p.archived && !vivo && p.createdAt < limiteGrazia) daArchiviare.push(p);
  // Solo quelli che ho archiviato io con questa regola.
  if (p.archived && vivo && MOTIVI_MIEI.includes(p.archivedReason ?? '')) daRipescare.push(p);
}

console.log(`finestra: consegne dal ${DA} in poi (le future contano)`);
console.log(`prodotti con almeno una consegna nella finestra: ${idVivi.size}`);
console.log(`   🔴 da archiviare: ${daArchiviare.length}`);
console.log(`   🟢 da RIPESCARE (li avevo archiviati a torto): ${daRipescare.length}`);
for (const p of daRipescare.slice(0, 6)) console.log(`      ${String(p.sku ?? '—').padEnd(14)}${String(p.name).slice(0, 44)}`);
const intoccabili = tutti.filter((p) => p.archived && idVivi.has(p.id) && !MOTIVI_MIEI.includes(p.archivedReason ?? ''));
console.log(`   🔒 archiviati da altri e lasciati stare: ${intoccabili.length}`);

if (!SCRIVI) { console.log('\n(prova a vuoto: rilanciare con --scrivi)'); await db.$disconnect(); process.exit(0); }

if (daArchiviare.length) {
  await db.product.updateMany({
    where: { id: { in: daArchiviare.map((p) => p.id) } },
    data: { archived: true, archivedAt: new Date(), archivedReason: MOTIVO },
  });
}
if (daRipescare.length) {
  await db.product.updateMany({
    where: { id: { in: daRipescare.map((p) => p.id) } },
    data: { archived: false, archivedAt: null, archivedReason: null },
  });
}
// Il motivo vecchio diventa quello nuovo: una regola sola, un nome solo.
await db.product.updateMany({
  where: { archivedReason: { in: ['mai-consegnato-2025-2026', 'fermo-da-2-anni'] } },
  data: { archivedReason: MOTIVO },
});
console.log(`\n✅ archiviati ${daArchiviare.length} · ripescati ${daRipescare.length}`);
console.log('   in lista ora:', await db.product.count({ where: { archived: false } }));

// Lo stato a Merchandising, per entrambe le direzioni.
const cfg = Object.fromEntries((await db.appSetting.findMany()).map((x) => [x.key, x.value]));
const url = (cfg.merchandisingUrl ?? '').replace(/\/+$/, '');
const chiave = cfg.merchandisingApiKey ?? '';
if (!url || !chiave) { console.log('\n⚠️ Merchandising non configurato: stato non comunicato.'); await db.$disconnect(); process.exit(0); }

const stati = [
  ...daArchiviare.filter((p) => p.sku).map((p) => ({ codice: p.sku, stato: 'archiviato' })),
  ...daRipescare.filter((p) => p.sku).map((p) => ({ codice: p.sku, stato: 'attivo' })),
];
let aggiornati = 0;
for (let i = 0; i < stati.length; i += 500) {
  const res = await fetch(`${url}/api/v1/prodotti/stato-piattaforma`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': chiave },
    body: JSON.stringify({ stati: stati.slice(i, i + 500) }),
  });
  if (!res.ok) { console.log(`   🔴 Merchandising risponde HTTP ${res.status}`); break; }
  aggiornati += (await res.json()).aggiornati ?? 0;
}
console.log(`📤 stato comunicato: ${stati.length} inviati · ${aggiornati} aggiornati in Merchandising`);
await db.$disconnect();

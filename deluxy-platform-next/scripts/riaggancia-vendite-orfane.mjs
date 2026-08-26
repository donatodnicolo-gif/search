// Riaggancia agli ordini le consegne di VENDITA vive rimaste SENZA
// `realOrderNumber` ma con un DDT numerico corto che e' il numero d'ordine
// («la regola del DDT»). Il numero da solo NON basta (brand diversi ripetono
// gli stessi numeri): un gruppo si aggancia solo se passa TRE prove —
//   1. numero: il DDT combacia ESATTAMENTE col numero umano dell'ordine;
//   2. data: l'ordine sta in una finestra credibile rispetto alla consegna
//      (ordine al massimo 2 giorni dopo, consegna entro 45 giorni dall'ordine);
//   3. valore: la somma delle righe del gruppo non supera il pagato oltre
//      il 20% (le righe sono al piu' il pubblico, spesso il valore partner).
// Se dopo le prove resta PIU' di un ordine possibile, non si tocca: si conta.
//
// Prova a secco di default; --scrivi per applicare (con backup su file).
//
//   node scripts/riaggancia-vendite-orfane.mjs [--scrivi]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RADICE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PrismaClient } = require(path.join(RADICE, 'node_modules', '@prisma/client'));
const SCRIVI = process.argv.includes('--scrivi');

const rigaEnv = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const imp = Object.fromEntries(
  (await db.appSetting.findMany({ where: { key: { in: ['ordersUrl', 'ordersApiKey'] } } }))
    .map((x) => [x.key, x.value]),
);
const urlOrders = imp.ordersUrl.replace(/\/+$/, '');
const cifre = (v) => String(v ?? '').replace(/\D/g, '');

// ── 1) tutti gli ordini da Orders: numero -> [{gid, brand, data}] ───────────
process.stdout.write('Leggo gli ordini da Orders');
const perNumero = new Map();
let pagina = 1;
while (true) {
  const res = await fetch(`${urlOrders}/api/v1/ordini?page=${pagina}&limit=200`, { headers: { 'x-api-key': imp.ordersApiKey } });
  if (!res.ok) { console.log(`\nHTTP ${res.status} a pagina ${pagina}`); process.exit(1); }
  const b = await res.json();
  for (const o of b.ordini ?? []) {
    const numero = String(o.numero ?? '').replace('#', '').trim();
    const gid = cifre(o.orderId);
    if (!numero || !gid) continue;
    const lista = perNumero.get(numero) ?? [];
    lista.push({ gid, brand: o.brand ?? null, data: o.data ? new Date(o.data) : null });
    perNumero.set(numero, lista);
  }
  process.stdout.write('.');
  if (!b.ordini?.length || pagina >= (b.pagine ?? 1)) break;
  pagina++;
}
console.log(` ${perNumero.size} numeri d'ordine.`);

// Il pagato per gid, dalla cache (guardia di valore) — Business compreso.
const cache = await db.$queryRawUnsafe('SELECT "orderId", totale, brand FROM platform."OrdineCliente"');
const pagatoPerGid = new Map(cache.map((o) => [String(o.orderId), { totale: Number(o.totale), brand: o.brand }]));

// ── 2) i gruppi orfani: DDT numerico corto, per ddt ─────────────────────────
const dels = await db.delivery.findMany({
  where: { deletedAt: null, status: { notIn: ['cancelled'] }, realOrderNumber: null, serviceType: { pricingModel: 'VENDITA' } },
  select: { id: true, code: true, date: true, ddtNumber: true, productValue: true,
    products: { select: { price: true, quantity: true } } },
});
const gruppi = new Map();
for (const d of dels) {
  const rif = String(d.ddtNumber ?? '').trim();
  if (!/^\d{3,6}$/.test(rif)) continue;
  const g = gruppi.get(rif) ?? [];
  g.push(d);
  gruppi.set(rif, g);
}
console.log(`Consegne orfane con DDT numerico: ${[...gruppi.values()].flat().length} in ${gruppi.size} gruppi.`);

// ── 3) le tre prove, gruppo per gruppo ──────────────────────────────────────
const daAgganciare = []; // {ids, codici, gid, brand, ddt}
let senzaOrdine = 0, fuoriData = 0, fuoriValore = 0, ambigui = 0, senzaPagato = 0;
const esempiScartati = [];
for (const [ddt, g] of gruppi) {
  const candidati = perNumero.get(ddt);
  if (!candidati?.length) { senzaOrdine++; continue; }
  const dataMin = new Date(Math.min(...g.map((d) => +new Date(d.date))));
  const sommaRighe = g.reduce((s, d) => s + d.products.reduce((r, p) => r + (p.price ?? 0) * (p.quantity ?? 1), 0), 0);

  const superstiti = candidati.filter((c) => {
    // prova DATA: ordine al massimo 2 giorni dopo la prima consegna,
    // e prima consegna entro 45 giorni dall'ordine.
    if (!c.data) return false;
    const scarto = (dataMin - c.data) / 86400000; // giorni: consegna - ordine
    if (scarto < -2 || scarto > 45) return false;
    // prova VALORE: le righe non superano il pagato oltre il 20% (+2 EUR).
    const pagato = pagatoPerGid.get(c.gid)?.totale;
    if (pagato == null) return false;
    return sommaRighe <= pagato * 1.2 + 2;
  });

  if (superstiti.length === 1) {
    const c = superstiti[0];
    daAgganciare.push({ ids: g.map((d) => d.id), codici: g.map((d) => d.code), gid: c.gid, brand: c.brand ?? pagatoPerGid.get(c.gid)?.brand ?? null, ddt });
  } else if (superstiti.length > 1) {
    ambigui++;
    if (esempiScartati.length < 8) esempiScartati.push(`ddt ${ddt}: ${superstiti.length} ordini possibili (${superstiti.map((c) => c.brand).join(', ')})`);
  } else {
    // nessun superstite: perche'?
    const conData = candidati.filter((c) => c.data && (dataMin - c.data) / 86400000 >= -2 && (dataMin - c.data) / 86400000 <= 45);
    if (!conData.length) fuoriData++;
    else if (conData.every((c) => pagatoPerGid.get(c.gid)?.totale == null)) senzaPagato++;
    else {
      fuoriValore++;
      if (esempiScartati.length < 8) {
        const c = conData[0];
        esempiScartati.push(`ddt ${ddt} (#${g.map((x) => x.code).join(',')}): righe ${sommaRighe} > pagato ${pagatoPerGid.get(c.gid)?.totale} ${c.brand}`);
      }
    }
  }
}
console.log(`\nDa agganciare (una sola risposta dopo le tre prove): ${daAgganciare.length} gruppi, ${daAgganciare.reduce((s, x) => s + x.ids.length, 0)} consegne`);
console.log(`Scartati — nessun ordine col numero: ${senzaOrdine} · data che non torna: ${fuoriData} · valore che non torna: ${fuoriValore} · pagato assente: ${senzaPagato} · ambigui (piu' ordini possibili): ${ambigui}`);
for (const e of esempiScartati) console.log('  ✋', e);
for (const x of daAgganciare.slice(0, 10)) console.log('  →', 'ddt', x.ddt, '→', x.brand, 'gid', x.gid, 'consegne', x.codici.join(','));

if (!SCRIVI) {
  console.log('\nPROVA A SECCO: nessuna scrittura. Rilanciare con --scrivi.');
} else if (daAgganciare.length) {
  const backup = daAgganciare.flatMap((x) => x.ids.map((id, i) => ({ id, code: x.codici[i], primaRealOrderNumber: null, primaDdtBrand: null, nuovoGid: x.gid, brand: x.brand })));
  const file = path.join(RADICE, 'legacy', `backup-riaggancio-vendite-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 1));
  console.log(`\nBackup (${backup.length} consegne) in ${file}`);
  let fatti = 0;
  for (const x of daAgganciare) {
    await db.delivery.updateMany({ where: { id: { in: x.ids } }, data: { realOrderNumber: x.gid, ddtBrand: x.brand } });
    fatti += x.ids.length;
    if (fatti % 200 < x.ids.length) process.stdout.write(`  agganciate ${fatti}…`);
  }
  console.log(`\nAgganciate ${fatti} consegne a ${daAgganciare.length} ordini.`);
}
await db.$disconnect();

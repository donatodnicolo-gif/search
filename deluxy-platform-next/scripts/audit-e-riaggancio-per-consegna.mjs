// Correzione del riaggancio di massa: il gruppo per DDT univa consegne di
// ANNI diversi sotto lo stesso numero (il ddt «1041» esiste nel 2024 Flowers,
// nel 2025 cakedesign e nel 2026 Business). Qui si lavora PER CONSEGNA:
//
//  1. gli ordini BUSINESS pagati (tabella-9) entrano nella cache dei pagati;
//  2. AUDIT: ogni consegna agganciata stanotte si ricontrolla da sola —
//     se la SUA data non torna con l'ordine, si sgancia;
//  3. RIAGGANCIO per consegna: candidati per numero (Orders + Business),
//     prove di data (consegna-ordine in [-2,45]; Business ±45) e di valore
//     (righe della consegna ≤ pagato ×1,2 + 2); se resta un solo ordine si
//     aggancia, altrimenti si conta e non si tocca.
//
// Prova a secco di default; --scrivi per applicare (backup su file).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RADICE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PrismaClient } = require(path.join(RADICE, 'node_modules', '@prisma/client'));
const SCRIVI = process.argv.includes('--scrivi');
const cifre = (v) => String(v ?? '').replace(/\D/g, '');

const rigaEnv = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

// ── CSV ─────────────────────────────────────────────────────────────────────
function* righeCsv(testo) {
  let campo = '', riga = [], inQ = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (inQ) { if (c === '"') { if (testo[i + 1] === '"') { campo += '"'; i++; } else inQ = false; } else campo += c; }
    else if (c === '"') inQ = true;
    else if (c === ',') { riga.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && testo[i + 1] === '\n') i++;
      riga.push(campo); campo = '';
      if (riga.length > 1 || riga[0] !== '') yield riga;
      riga = [];
    } else campo += c;
  }
}

// ── Business da tabella-9 ───────────────────────────────────────────────────
const itB = righeCsv(fs.readFileSync(path.join(RADICE, 'legacy', 'tabelle', 'tabella-9.csv'), 'utf8'));
const testaB = itB.next().value;
const business = [];
for (const r of itB) {
  const o = Object.fromEntries(testaB.map((h, i) => [h, r[i]]));
  if (!o.realOrderNumber || o.realOrderNumber === 'NULL') continue;
  business.push({
    numero: String(o.orderId).trim(), gid: cifre(o.realOrderNumber),
    totale: Number(o.total), pagato: o.paymentStatus === 'paid',
    data: new Date(String(o.createdAt).slice(0, 10)),
  });
}
console.log(`Business con gid: ${business.length} (pagati ${business.filter((b) => b.pagato).length})`);

// ── 1) Business pagati in cache ─────────────────────────────────────────────
const inCache = new Set((await db.$queryRawUnsafe('SELECT "orderId" FROM platform."OrdineCliente"')).map((o) => String(o.orderId)));
const nuovi = business.filter((b) => b.pagato && !inCache.has(b.gid));
console.log(`Business pagati da inserire in cache: ${nuovi.length}`);
if (SCRIVI) {
  for (const b of nuovi) {
    await db.$executeRawUnsafe(
      'INSERT INTO platform."OrdineCliente" ("id","orderId","ordersId","brand","numero","prodotti","consegna","totale","aggiornatoIl") VALUES (gen_random_uuid(),$1,NULL,$2,$3,$4::float8,0,$4::float8,now()) ON CONFLICT ("orderId") DO NOTHING',
      b.gid, 'Business', b.numero, b.totale);
  }
}

// ── Ordini da Orders: numero -> candidati, e gid -> data ────────────────────
const imp = Object.fromEntries(
  (await db.appSetting.findMany({ where: { key: { in: ['ordersUrl', 'ordersApiKey'] } } })).map((x) => [x.key, x.value]),
);
const urlOrders = imp.ordersUrl.replace(/\/+$/, '');
const perNumero = new Map();
const dataPerGid = new Map();
process.stdout.write('Leggo gli ordini da Orders');
let pagina = 1;
while (true) {
  const res = await fetch(`${urlOrders}/api/v1/ordini?page=${pagina}&limit=200`, { headers: { 'x-api-key': imp.ordersApiKey } });
  if (!res.ok) { console.log(`\nHTTP ${res.status}`); process.exit(1); }
  const b = await res.json();
  for (const o of b.ordini ?? []) {
    const numero = String(o.numero ?? '').replace('#', '').trim();
    const gid = cifre(o.orderId);
    if (!numero || !gid) continue;
    const data = o.data ? new Date(o.data) : null;
    (perNumero.get(numero) ?? perNumero.set(numero, []).get(numero)).push({ gid, brand: o.brand ?? null, data, business: false });
    if (data) dataPerGid.set(gid, data);
  }
  process.stdout.write('.');
  if (!b.ordini?.length || pagina >= (b.pagine ?? 1)) break;
  pagina++;
}
console.log(` ${perNumero.size} numeri.`);
for (const b of business.filter((x) => x.pagato)) {
  (perNumero.get(b.numero) ?? perNumero.set(b.numero, []).get(b.numero)).push({ gid: b.gid, brand: 'Business', data: b.data, business: true });
  dataPerGid.set(b.gid, b.data);
}
const cache = await db.$queryRawUnsafe('SELECT "orderId", totale FROM platform."OrdineCliente"');
const pagatoPerGid = new Map(cache.map((o) => [String(o.orderId), Number(o.totale)]));
for (const b of nuovi) pagatoPerGid.set(b.gid, b.totale); // anche in prova a secco

const finestraOk = (consegna, ordine, isBusiness) => {
  const s = (consegna - ordine) / 86400000;
  return isBusiness ? Math.abs(s) <= 45 : (s >= -2 && s <= 45);
};

// ── 2) AUDIT delle agganciate di stanotte ───────────────────────────────────
const backup = JSON.parse(fs.readFileSync(path.join(RADICE, 'legacy', 'backup-riaggancio-vendite-2026-08-26.json'), 'utf8'));
const codici = backup.map((x) => x.code);
const agganciate = await db.delivery.findMany({
  where: { code: { in: codici } },
  select: { id: true, code: true, date: true, ddtNumber: true, realOrderNumber: true },
});
const daSganciare = [];
for (const d of agganciate) {
  if (!d.realOrderNumber) continue;
  const dataOrdine = dataPerGid.get(String(d.realOrderNumber));
  if (!dataOrdine) continue;
  if (!finestraOk(new Date(d.date), dataOrdine, false)) daSganciare.push(d);
}
console.log(`\nAUDIT: consegne agganciate stanotte con data che NON torna da sole: ${daSganciare.length}`);
for (const d of daSganciare.slice(0, 15)) console.log('  ✋ #' + d.code, String(d.date).slice(4, 15), 'ddt', d.ddtNumber, '→ ordine del', String(dataPerGid.get(String(d.realOrderNumber))).slice(4, 15));
if (SCRIVI && daSganciare.length) {
  await db.delivery.updateMany({ where: { id: { in: daSganciare.map((d) => d.id) } }, data: { realOrderNumber: null, ddtBrand: null } });
  console.log(`Sganciate ${daSganciare.length}.`);
}

// ── 3) riaggancio PER CONSEGNA di tutte le orfane ───────────────────────────
const sganciateIds = new Set(daSganciare.map((d) => d.id));
const orfane = (await db.delivery.findMany({
  where: { deletedAt: null, status: { notIn: ['cancelled'] }, serviceType: { pricingModel: 'VENDITA' },
    OR: [{ realOrderNumber: null }, { id: { in: [...sganciateIds] } }] },
  select: { id: true, code: true, date: true, ddtNumber: true,
    products: { select: { price: true, quantity: true } } },
})).filter((d) => /^\d{3,6}$/.test(String(d.ddtNumber ?? '').trim()));
console.log(`Orfane con DDT numerico da provare: ${orfane.length}`);

let agganciateN = 0, ambigue = 0, senzaRisposta = 0;
const daScrivere = [];
const esempiAmbigue = [];
for (const d of orfane) {
  const rif = String(d.ddtNumber).trim();
  const candidati = perNumero.get(rif) ?? [];
  const righe = d.products.reduce((s, p) => s + (p.price ?? 0) * (p.quantity ?? 1), 0);
  const superstiti = candidati.filter((c) => {
    if (!c.data || !finestraOk(new Date(d.date), c.data, c.business)) return false;
    const pagato = pagatoPerGid.get(c.gid);
    return pagato != null && righe <= pagato * 1.2 + 2;
  });
  if (superstiti.length === 1) {
    daScrivere.push({ id: d.id, code: d.code, gid: superstiti[0].gid, brand: superstiti[0].brand });
    agganciateN++;
  } else if (superstiti.length > 1) {
    ambigue++;
    if (esempiAmbigue.length < 10) esempiAmbigue.push(`#${d.code} ddt ${rif}: ${superstiti.map((c) => c.brand).join(' | ')}`);
  } else senzaRisposta++;
}
console.log(`Riaggancio per consegna: da agganciare ${agganciateN} · ambigue ${ambigue} · senza risposta ${senzaRisposta}`);
for (const e of esempiAmbigue) console.log('  ⚖', e);

if (!SCRIVI) {
  console.log('\nPROVA A SECCO: nessuna scrittura. Rilanciare con --scrivi.');
} else {
  const file = path.join(RADICE, 'legacy', `backup-riaggancio-2-per-consegna-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(file, JSON.stringify({ sganciate: daSganciare.map((d) => ({ id: d.id, code: d.code, era: d.realOrderNumber })), agganciate: daScrivere }, null, 1));
  console.log(`Backup in ${file}`);
  for (const x of daScrivere) {
    await db.delivery.update({ where: { id: x.id }, data: { realOrderNumber: x.gid, ddtBrand: x.brand } });
  }
  console.log(`Agganciate ${daScrivere.length} consegne (per consegna, non per gruppo).`);
}
await db.$disconnect();

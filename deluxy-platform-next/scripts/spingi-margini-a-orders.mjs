/**
 * Manda a Orders gli INGREDIENTI del margine sulla consegna nostra.
 *
 * Orders sa gia' fare il conto — `totale − costoFornitore − costoConsegna +
 * feeConsegna` — ma dichiarava il margine PARZIALE con la nota «la piattaforma
 * non lo espone ancora». Questa e' l'esposizione.
 *
 * Le formule sono quelle del manuale §3.8 (verificate su app.deluxy.it il 21/07):
 *   costoConsegna = paga del valet        = valetSalary + valetAdditionalPrice
 *   feeConsegna   = Fee% x prezzo partner = commissionPercent/100 x (price + additionalPrice)
 *
 * ⚠️ Si mandano gli INGREDIENTI, non il margine gia' fatto: il margine si
 * calcola in un posto solo (Standard §7). Il totale dell'ordine e il costo del
 * fornitore vivono in Orders e qui non si conoscono.
 *
 * ⚠️ Il legame passa dal numero Shopify. Orders lo tiene in forma lunga
 * (`gid://shopify/Order/1103…`), la piattaforma nudo (`1103…`): senza
 * normalizzare, l'appaiamento usciva ZERO su 4.000 ordini e 11.054 consegne che
 * il numero ce l'hanno.
 *
 * Sola lettura di default. `--scrivi` per applicare.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const SCRIVI = process.argv.includes('--scrivi');
const LIMITE = Number((process.argv.find((a) => a.startsWith('--ordini=')) ?? '--ordini=20000').split('=')[1]);

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const numeroShopify = (v) => {
  const t = String(v ?? '').trim();
  if (!t) return null;
  const coda = t.split('/').pop() ?? '';
  return /^\d+$/.test(coda) ? coda : null;
};
const eur = (n) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';

const imp = Object.fromEntries(
  (await db.appSetting.findMany({ where: { key: { in: ['ordersUrl', 'ordersApiKey'] } } }))
    .map((x) => [x.key, x.value]),
);
if (!imp.ordersUrl || !imp.ordersApiKey) {
  console.log('Indirizzo o chiave di Orders non impostati.');
  process.exit(1);
}
const url = imp.ordersUrl.replace(/\/+$/, '');

// 1) Gli ordini che Orders conosce, per tradurre il numero nel suo id interno.
const perOrderId = new Map();
let pagina = 1;
process.stdout.write('Leggo gli ordini da Orders');
while (perOrderId.size < LIMITE) {
  const res = await fetch(`${url}/api/v1/ordini?page=${pagina}&limit=200`, { headers: { 'x-api-key': imp.ordersApiKey } });
  if (!res.ok) { console.log(`\nOrders risponde HTTP ${res.status} alla pagina ${pagina}.`); break; }
  const b = await res.json();
  for (const o of b.ordini ?? []) {
    const k = numeroShopify(o.orderId);
    if (k) perOrderId.set(k, {
      id: o.id, numero: o.numero,
      gia: { costoConsegna: o.controllo?.costoConsegna ?? null, feeConsegna: o.controllo?.feeConsegna ?? null },
    });
  }
  process.stdout.write('.');
  if (!b.ordini?.length || pagina >= (b.pagine ?? 1)) break;
  pagina++;
}
console.log(` ${perOrderId.size.toLocaleString('it-IT')} ordini.`);

// 2) Le consegne che portano un numero d'ordine conosciuto.
const dd = await db.delivery.findMany({
  where: { deletedAt: null, realOrderNumber: { in: [...perOrderId.keys()] } },
  select: {
    realOrderNumber: true, valetSalary: true, valetAdditionalPrice: true,
    price: true, additionalPrice: true,
    partner: { select: { commissionPercent: true } },
  },
});

// 3) Somma per ordine: un ordine puo' avere piu' consegne, e sommarle e'
//    l'unico modo perche' il costo dell'ordine sia il costo dell'ordine.
const per = new Map();
for (const d of dd) {
  const k = d.realOrderNumber;
  const c = per.get(k) ?? { costoConsegna: 0, feeConsegna: 0, consegne: 0, senzaFee: 0 };
  c.consegne++;
  // ⭐ 26/08: il MINUS e' contante trattenuto dal valet, un debito suo — non
  // abbassa il costo della consegna. Il PLUS invece lo paghiamo davvero.
  c.costoConsegna += (d.valetSalary ?? 0) + Math.max(0, d.valetAdditionalPrice ?? 0);
  const prezzoPartner = (d.price ?? 0) + (d.additionalPrice ?? 0);
  const fee = d.partner?.commissionPercent ?? 0;
  if (fee > 0) c.feeConsegna += (fee / 100) * prezzoPartner;
  else c.senzaFee++;
  per.set(k, c);
}

// ⚠️ Mai sotto zero. Su 108 consegne il minus supera la paga (una ha 7,20 EUR
// di paga e un minus di −142) e su 75 supera il prezzo del partner: il conto
// usciva negativo, e Orders lo rifiutava — giustamente, perche' un costo
// negativo vorrebbe dire che il valet paga noi. E' lo stesso pavimento che il
// calcolo degli stipendi applica gia': un minus non trasforma nessuno in
// debitore.
const maiSottoZero = (n) => Math.max(0, Math.round(n * 100) / 100);

const voci = [...per.entries()].map(([k, c]) => ({
  ordersId: perOrderId.get(k).id,
  numero: perOrderId.get(k).numero,
  consegne: c.consegne,
  senzaFee: c.senzaFee,
  costoConsegna: maiSottoZero(c.costoConsegna),
  feeConsegna: maiSottoZero(c.feeConsegna),
  /// Quello che Orders ha gia' scritto: se combacia, l'ordine si salta.
  giaScritto: perOrderId.get(k).gia,
}));

const totCosto = voci.reduce((s, v) => s + v.costoConsegna, 0);
const totFee = voci.reduce((s, v) => s + v.feeConsegna, 0);

console.log(SCRIVI ? 'SCRITTURA' : 'PROVA A VUOTO — rilancia con --scrivi');
console.log(`Ordini con ingredienti: ${voci.length.toLocaleString('it-IT')} · consegne collegate: ${dd.length.toLocaleString('it-IT')}`);
console.log(`  costo consegna: ${eur(totCosto)} · fee: ${eur(totFee)}`);
console.log(`  ordini con almeno una consegna il cui partner non ha Fee%: ${voci.filter((v) => v.senzaFee > 0).length.toLocaleString('it-IT')}`);

if (!SCRIVI) { await db.$disconnect(); process.exit(0); }

let scritti = 0;
let saltati = 0;
const errori = [];
for (const v of voci) {
  // Gia' scritto con gli stessi numeri: rimandarlo sarebbe solo tempo. Cosi' un
  // rilancio dopo un'interruzione costa quanto quello che manca davvero.
  if (v.giaScritto
      && v.giaScritto.costoConsegna === v.costoConsegna
      && v.giaScritto.feeConsegna === v.feeConsegna) {
    saltati++;
    continue;
  }
  try {
    const res = await fetch(`${url}/api/v1/ordini/${v.ordersId}`, {
      method: 'PATCH',
      headers: { 'x-api-key': imp.ordersApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ costoConsegna: v.costoConsegna, feeConsegna: v.feeConsegna }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      errori.push(`${v.numero}: HTTP ${res.status} ${t.slice(0, 90)}`);
      // 401/403 non e' un caso isolato: e' la chiave sbagliata, e insistere per
      // migliaia di ordini non la fa diventare giusta.
      if (res.status === 401 || res.status === 403) break;
      continue;
    }
    scritti++;
    if (scritti % 250 === 0) process.stdout.write(`\r  scritti ${scritti}/${voci.length}…`);
  } catch (e) {
    errori.push(`${v.numero}: ${e.message}`);
  }
}
console.log(`\r  Ordini aggiornati: ${scritti.toLocaleString('it-IT')} · gia' a posto: ${saltati.toLocaleString('it-IT')} · su ${voci.length.toLocaleString('it-IT')}          `);
if (errori.length) {
  console.log(`  Errori: ${errori.length}`);
  for (const e of errori.slice(0, 5)) console.log('    ' + e);
}
await db.$disconnect();

/**
 * Spinge a Orders, per ogni ordine, TUTTO il pacchetto (26/08, deciso
 * dall'utente): gli ingredienti (costo consegna, fee di listino) e l'ECONOMIA
 * della vendita gia' calcolata — primoMargine (pagato − valore prodotti,
 * ÷1,22), feeVendita (quota registrata, lorda), margineFinale.
 *
 * ⚠️ L'economia NON si ricalcola qui: si chiede alla piattaforma deployata
 * (`GET /finance/economia-vendite`, le stesse funzioni della pagina Finanza).
 * Un conto rifatto in uno script prima o poi diverge da quello vero.
 *
 * Questo script esiste perche' la PRIMA spinta tocca ~9.200 ordini e non sta
 * nei 300 s della funzione serverless: da qui non c'e' fretta. Le notti
 * successive bastano al cron, che manda solo i delta.
 *
 * Sola lettura di default. `--scrivi` per applicare.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const SCRIVI = process.argv.includes('--scrivi');
const BASE = 'https://deluxy-delivery.vercel.app/api/v1';

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const numeroShopify = (v) => {
  const coda = String(v ?? '').trim().split('/').pop() ?? '';
  return /^\d+$/.test(coda) ? coda : null;
};
const eur = (n) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';

// ── credenziali: Orders da AppSetting, piattaforma via login admin ──────────
const imp = Object.fromEntries(
  (await db.appSetting.findMany({ where: { key: { in: ['ordersUrl', 'ordersApiKey'] } } }))
    .map((x) => [x.key, x.value]),
);
const url = imp.ordersUrl.replace(/\/+$/, '');

let tok = null;
for (let i = 0; i < 4 && !tok; i++) {
  try {
    const r = await fetch(`${BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@deluxy.it', password: 'Deluxy2026!' }),
      signal: AbortSignal.timeout(40000),
    });
    if (r.ok) tok = (await r.json()).accessToken;
  } catch { /* avvio a freddo */ }
}
if (!tok) { console.log('LOGIN FALLITO'); process.exit(1); }

// ── 1) l'economia dalla piattaforma (formule della Finanza, sul server) ─────
process.stdout.write("Chiedo l'economia delle vendite alla piattaforma… ");
const recEco = await fetch(`${BASE}/finance/economia-vendite`, {
  headers: { Authorization: `Bearer ${tok}` },
  signal: AbortSignal.timeout(280000),
});
if (!recEco.ok) { console.log(`HTTP ${recEco.status}`); process.exit(1); }
const economia = await recEco.json();
console.log(`${Object.keys(economia).length.toLocaleString('it-IT')} ordini con economia.`);

// ── 2) gli ordini di Orders, col gia'-scritto per saltare gli identici ──────
const perOrderId = new Map();
let pagina = 1;
process.stdout.write('Leggo gli ordini da Orders');
while (true) {
  const res = await fetch(`${url}/api/v1/ordini?page=${pagina}&limit=200`, { headers: { 'x-api-key': imp.ordersApiKey } });
  if (!res.ok) { console.log(`\nHTTP ${res.status} a pagina ${pagina}`); process.exit(1); }
  const b = await res.json();
  for (const o of b.ordini ?? []) {
    const k = numeroShopify(o.orderId);
    if (k) perOrderId.set(k, {
      id: o.id, numero: o.numero,
      gia: {
        costoConsegna: o.controllo?.costoConsegna ?? null,
        feeConsegna: o.controllo?.feeConsegna ?? null,
        primoMargine: o.controllo?.primoMargine ?? null,
        feeVendita: o.controllo?.feeVendita ?? null,
        margineFinale: o.controllo?.margineFinale ?? null,
        metodoIncasso: o.controllo?.metodoIncasso ?? null,
        commissioneIncassi: o.controllo?.commissioneIncassi ?? null,
      },
    });
  }
  process.stdout.write('.');
  if (!b.ordini?.length || pagina >= (b.pagine ?? 1)) break;
  pagina++;
}
console.log(` ${perOrderId.size.toLocaleString('it-IT')} ordini.`);

// ── 3) gli ingredienti (come la spinta margini di sempre) ───────────────────
const dd = await db.delivery.findMany({
  where: { deletedAt: null, realOrderNumber: { in: [...perOrderId.keys()] } },
  select: {
    realOrderNumber: true, valetSalary: true, valetAdditionalPrice: true,
    price: true, additionalPrice: true,
    partner: { select: { commissionPercent: true } },
    valet: { select: { hasVat: true, withholdingPercent: true } },
  },
});
const per = new Map();
for (const d of dd) {
  const k = d.realOrderNumber;
  const c = per.get(k) ?? { costoConsegna: 0, feeConsegna: 0 };
  // La paga dei senza P.IVA e' il loro netto: sopra c'e' la ritenuta
  // d'acconto (paga x (1 - % rimborso) x 25%), costo vero della consegna.
  // ⭐ 26/08: il MINUS non abbassa il costo — e' contante trattenuto dal valet
  // (un suo debito) e incide solo su quanto gli paghiamo. Il PLUS invece si'.
  const paga = Math.max(0, (d.valetSalary ?? 0) + Math.max(0, d.valetAdditionalPrice ?? 0));
  const ritenuta = paga > 0 && d.valet && d.valet.hasVat === false
    ? paga * (1 - ((d.valet.withholdingPercent ?? 0) / 100)) * 0.25
    : 0;
  c.costoConsegna += paga + ritenuta;
  const pp = (d.price ?? 0) + (d.additionalPrice ?? 0);
  const fee = d.partner?.commissionPercent ?? 0;
  if (fee > 0) c.feeConsegna += (fee / 100) * pp;
  per.set(k, c);
}
const zero = (n) => Math.max(0, Math.round(n * 100) / 100);
const tondo = (n) => Math.round(n * 100) / 100;

// ── 4) il confronto e la scrittura ──────────────────────────────────────────
const voci = [];
for (const [orderId, info] of perOrderId) {
  const ing = per.get(orderId);
  const eco = economia[orderId] ?? null;
  if (!ing && !eco) continue; // niente da dire su questo ordine
  voci.push({
    ordersId: info.id, numero: info.numero, gia: info.gia,
    costoConsegna: ing ? zero(ing.costoConsegna) : null,
    feeConsegna: ing ? zero(ing.feeConsegna) : null,
    primoMargine: eco ? tondo(eco.primoMargine) : null,
    feeVendita: eco ? zero(eco.feeVendita) : null,
    margineFinale: eco ? tondo(eco.margineFinale) : null,
    metodoIncasso: eco ? (eco.metodoIncasso ?? null) : null,
    commissioneIncassi: eco ? zero(eco.commissioneIncassi) : null,
  });
}
const daScrivere = voci.filter((v) =>
  v.gia.costoConsegna !== v.costoConsegna || v.gia.feeConsegna !== v.feeConsegna
  || v.gia.primoMargine !== v.primoMargine || v.gia.feeVendita !== v.feeVendita
  || v.gia.margineFinale !== v.margineFinale
  || (v.gia.metodoIncasso ?? null) !== (v.metodoIncasso ?? null)
  || v.gia.commissioneIncassi !== v.commissioneIncassi);
console.log(`Ordini con qualcosa da dire: ${voci.length.toLocaleString('it-IT')} · da scrivere: ${daScrivere.length.toLocaleString('it-IT')}`);
const conEco = voci.filter((v) => v.margineFinale != null);
console.log(`  con economia: ${conEco.length.toLocaleString('it-IT')} · primo margine totale: ${eur(conEco.reduce((s, v) => s + v.primoMargine, 0))} · fee: ${eur(conEco.reduce((s, v) => s + v.feeVendita, 0))} · margine finale: ${eur(conEco.reduce((s, v) => s + v.margineFinale, 0))}`);

if (!SCRIVI) { console.log('PROVA A VUOTO — rilancia con --scrivi'); await db.$disconnect(); process.exit(0); }

let scritti = 0;
const errori = [];
for (const v of daScrivere) {
  try {
    const res = await fetch(`${url}/api/v1/ordini/${v.ordersId}`, {
      method: 'PATCH',
      headers: { 'x-api-key': imp.ordersApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        costoConsegna: v.costoConsegna, feeConsegna: v.feeConsegna,
        primoMargine: v.primoMargine, feeVendita: v.feeVendita, margineFinale: v.margineFinale,
        metodoIncasso: v.metodoIncasso, commissioneIncassi: v.commissioneIncassi,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      errori.push(`${v.numero}: HTTP ${res.status} ${t.slice(0, 90)}`);
      if (res.status === 401 || res.status === 403) break;
      continue;
    }
    scritti++;
    if (scritti % 250 === 0) process.stdout.write(`\r  scritti ${scritti}/${daScrivere.length}…`);
  } catch (e) { errori.push(`${v.numero}: ${e.message}`); }
}
console.log(`\r  Ordini aggiornati: ${scritti.toLocaleString('it-IT')} su ${daScrivere.length.toLocaleString('it-IT')}          `);
if (errori.length) { console.log(`  Errori: ${errori.length}`); for (const e of errori.slice(0, 5)) console.log('    ' + e); }
await db.$disconnect();

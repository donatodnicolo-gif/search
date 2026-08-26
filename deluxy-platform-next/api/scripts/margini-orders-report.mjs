/**
 * SOLA LETTURA — il MARGINE COME RISULTA A ORDERS: totale, per brand e per
 * citta', spaccato per anno.
 *
 * Si usa `controllo.margine`, cioe' il numero che Orders mostra: quello della
 * piattaforma dove c'e' (`fonte: piattaforma`), il ripiego del registro dove
 * la piattaforma non arriva. `null` = non misurabile, e si conta a parte.
 *
 * ⚠️ Fuori gli ANNULLATI e i RIMBORSATI, come fa Orders nelle sue misure.
 * ⚠️ L'anno e' quello di ROMA, non UTC (un ordine del 31/12 alle 23:30 e' del
 * suo anno, non del successivo).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({ datasources: { db: { url:
  `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } } });

const imp = Object.fromEntries(
  (await db.appSetting.findMany({ where: { key: { in: ['ordersUrl', 'ordersApiKey'] } } })).map((x) => [x.key, x.value]));
const url = imp.ordersUrl.replace(/\/+$/, '');

const eur = (n) => (n ?? 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const annoDi = (iso) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', year: 'numeric' }).format(new Date(iso));
const norm = (s) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  .replace(/^(comune di |citta di )/, '').replace(/\b\w/g, (c) => c.toUpperCase());

const ALIAS = {
  'Milan': 'Milano', 'Milano ': 'Milano', 'Rome': 'Roma', 'Florence': 'Firenze',
  'Venice': 'Venezia', 'Naples': 'Napoli', 'Turin': 'Torino', 'Genoa': 'Genova',
  'Padua': 'Padova', 'Bologne': 'Bologna', 'Sardinia': 'Sardegna',
};
const citta = (o) => {
  const vera = norm(o.spedizione?.citta);
  if (vera) return ALIAS[vera] ?? vera;
  const ded = norm(o.cittaDedotta?.citta);
  if (ded) return (ALIAS[ded] ?? ded) + ' (dedotta)';
  return '(non indicata)';
};
const righe = [];
let pagina = 1, saltatiAnnullati = 0, senzaMargine = 0, parziali = 0;
process.stdout.write('Leggo Orders');
while (true) {
  const res = await fetch(`${url}/api/v1/ordini?page=${pagina}&limit=200`, { headers: { 'x-api-key': imp.ordersApiKey } });
  if (!res.ok) { console.log(`\nHTTP ${res.status} a pagina ${pagina}`); break; }
  const b = await res.json();
  for (const o of b.ordini ?? []) {
    const fs_ = o.shopify?.financialStatus ?? null;
    if (o.shopify?.annullato || fs_ === 'REFUNDED' || fs_ === 'VOIDED') { saltatiAnnullati++; continue; }
    const m = o.controllo?.margine ?? null;
    if (m == null) { senzaMargine++; continue; }
    if (o.controllo?.margineParziale) parziali++;
    righe.push({
      anno: annoDi(o.data),
      brand: o.brand ?? '(senza brand)',
      citta: citta(o),
      margine: m,
      totale: o.totale ?? 0,
      fonte: o.controllo?.margineNota?.startsWith('margine della piattaforma') ? 'piattaforma' : 'registro',
    });
  }
  process.stdout.write('.');
  if (!b.ordini?.length || pagina >= (b.pagine ?? 1)) break;
  pagina++;
}

const somma = (a, f) => a.reduce((s, x) => s + f(x), 0);
const anni = [...new Set(righe.map((r) => r.anno))].sort();

console.log(`\n\nOrdini con un margine misurabile: ${righe.length}`);
console.log(`  esclusi perche' annullati o rimborsati: ${saltatiAnnullati}`);
console.log(`  esclusi perche' il margine non e' misurabile: ${senzaMargine}`);
console.log(`  di quelli contati, margine PARZIALE (manca un pezzo): ${parziali}`);
const daPiattaforma = righe.filter((r) => r.fonte === 'piattaforma');
console.log(`  margine dalla PIATTAFORMA: ${daPiattaforma.length} ordini · dal ripiego del registro: ${righe.length - daPiattaforma.length}`);

console.log('\n================ TOTALE PER ANNO ================');
console.log('anno |   ordini |        venduto |         MARGINE |   %');
for (const a of anni) {
  const r = righe.filter((x) => x.anno === a);
  const v = somma(r, (x) => x.totale), m = somma(r, (x) => x.margine);
  console.log(`${a} | ${String(r.length).padStart(8)} | ${eur(v).padStart(14)} | ${eur(m).padStart(15)} | ${v > 0 ? (m / v * 100).toFixed(1) : '-'}`);
}
console.log(`TOT  | ${String(righe.length).padStart(8)} | ${eur(somma(righe, (x) => x.totale)).padStart(14)} | ${eur(somma(righe, (x) => x.margine)).padStart(15)} | ${(somma(righe, (x) => x.margine) / somma(righe, (x) => x.totale) * 100).toFixed(1)}`);

console.log('\n================ PER BRAND E ANNO ================');
const brands = [...new Set(righe.map((r) => r.brand))].sort();
console.log(['brand'.padEnd(14), ...anni.map((a) => a.padStart(14)), 'TOTALE'.padStart(15)].join(' |'));
for (const b of brands) {
  const cel = anni.map((a) => eur(somma(righe.filter((r) => r.brand === b && r.anno === a), (x) => x.margine)).padStart(14));
  const tot = eur(somma(righe.filter((r) => r.brand === b), (x) => x.margine)).padStart(15);
  console.log([b.padEnd(14), ...cel, tot].join(' |'));
}

console.log('\n================ PER CITTA E ANNO (le prime 20 per margine) ================');
const perCitta = new Map();
for (const r of righe) perCitta.set(r.citta, (perCitta.get(r.citta) ?? 0) + r.margine);
const top = [...perCitta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
console.log(['citta'.padEnd(22), ...anni.map((a) => a.padStart(13)), 'TOTALE'.padStart(14), 'ordini'.padStart(7)].join(' |'));
for (const [c] of top) {
  const cel = anni.map((a) => eur(somma(righe.filter((r) => r.citta === c && r.anno === a), (x) => x.margine)).padStart(13));
  const suoi = righe.filter((r) => r.citta === c);
  console.log([c.slice(0, 22).padEnd(22), ...cel, eur(somma(suoi, (x) => x.margine)).padStart(14), String(suoi.length).padStart(7)].join(' |'));
}
const altre = righe.filter((r) => !top.some(([c]) => c === r.citta));
console.log(`\n… e altre ${new Set(altre.map((r) => r.citta)).size} citta' per ${eur(somma(altre, (x) => x.margine))} EUR su ${altre.length} ordini.`);

// il file completo, per chi vuole guardarselo
const csv = ['anno;brand;citta;ordini;venduto;margine'];
const chiavi = new Map();
for (const r of righe) {
  const k = `${r.anno};${r.brand};${r.citta}`;
  const x = chiavi.get(k) ?? { n: 0, v: 0, m: 0 };
  x.n++; x.v += r.totale; x.m += r.margine; chiavi.set(k, x);
}
for (const [k, x] of [...chiavi.entries()].sort()) csv.push(`${k};${x.n};${x.v.toFixed(2)};${x.m.toFixed(2)}`);
const dest = 'C:/Users/nicol/app/margini-orders-per-anno-citta-brand.csv';
fs.writeFileSync(dest, csv.join('\n'), 'utf8');
console.log(`\nDettaglio completo in ${dest} (${chiavi.size} righe anno/brand/citta).`);

await db.$disconnect();

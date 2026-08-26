/**
 * SOLA LETTURA — gli stessi numeri di `margini-orders-report.mjs` letti in
 * PERCENTUALE, dal CSV che quello produce (niente seconda scansione di Orders).
 *
 * Due percentuali diverse, e vanno tenute distinte:
 *  - MARGINALITA' = margine ÷ venduto: quanto rende quello che si vende.
 *  - PESO         = quota del margine totale: quanto pesa nel conto di casa.
 * La stessa riga puo' rendere tanto e pesare niente (Crotone) o il contrario.
 *
 * ⚠️ La base della marginalita' e' il VENDUTO LORDO (totale pagato dal
 * cliente), la stessa base che usa Orders per `marginePct`.
 */
import fs from 'node:fs';

const CSV = process.argv[2] ?? 'C:/Users/nicol/app/margini-orders-per-anno-citta-brand.csv';
const righe = fs.readFileSync(CSV, 'utf8').trim().split(/\r?\n/).slice(1).map((l) => {
  const [anno, brand, citta, ordini, venduto, margine] = l.split(';');
  return { anno, brand, citta, ordini: +ordini, venduto: +venduto, margine: +margine };
});

const pct = (n, d) => (d > 0 ? (n / d * 100).toFixed(1).replace('.', ',') + '%' : '—');
const somma = (a, f) => a.reduce((s, x) => s + f(x), 0);
const anni = [...new Set(righe.map((r) => r.anno))].sort();
const VEND = somma(righe, (x) => x.venduto), MARG = somma(righe, (x) => x.margine);
// le grafie inglesi sono gia' unite dal report; qui si uniscono le dedotte
const citta = (c) => c.replace(/ \(dedotta\)$/, '');

console.log(`\nBase: ${righe.reduce((s, r) => s + r.ordini, 0)} ordini · venduto ${VEND.toLocaleString('it-IT', { minimumFractionDigits: 2 })} € · margine ${MARG.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €`);

console.log('\n================ PER ANNO ================');
console.log('anno | marginalita | peso sul margine | peso sul venduto');
for (const a of anni) {
  const r = righe.filter((x) => x.anno === a);
  const v = somma(r, (x) => x.venduto), m = somma(r, (x) => x.margine);
  console.log(`${a} | ${pct(m, v).padStart(11)} | ${pct(m, MARG).padStart(16)} | ${pct(v, VEND).padStart(16)}`);
}
console.log(`TOT  | ${pct(MARG, VEND).padStart(11)} |           100,0% |           100,0%`);

console.log('\n================ MARGINALITA PER BRAND E ANNO ================');
const brands = [...new Set(righe.map((r) => r.brand))].sort();
console.log(['brand'.padEnd(14), ...anni.map((a) => a.padStart(8)), 'TOTALE'.padStart(8), 'peso sul margine'.padStart(17)].join(' |'));
for (const b of brands) {
  const suoi = righe.filter((r) => r.brand === b);
  const cel = anni.map((a) => {
    const r = suoi.filter((x) => x.anno === a);
    return pct(somma(r, (x) => x.margine), somma(r, (x) => x.venduto)).padStart(8);
  });
  console.log([b.padEnd(14), ...cel,
    pct(somma(suoi, (x) => x.margine), somma(suoi, (x) => x.venduto)).padStart(8),
    pct(somma(suoi, (x) => x.margine), MARG).padStart(17)].join(' |'));
}

console.log('\n================ CITTA: le prime 15 per MARGINE ================');
const perCitta = new Map();
for (const r of righe) {
  const k = citta(r.citta);
  const x = perCitta.get(k) ?? { v: 0, m: 0, n: 0 };
  x.v += r.venduto; x.m += r.margine; x.n += r.ordini; perCitta.set(k, x);
}
const top = [...perCitta.entries()].sort((a, b) => b[1].m - a[1].m).slice(0, 15);
console.log(['citta'.padEnd(20), 'ordini'.padStart(7), 'marginalita'.padStart(12), 'peso sul margine'.padStart(17), ...anni.map((a) => a.padStart(8))].join(' |'));
for (const [c, x] of top) {
  const cel = anni.map((a) => {
    const r = righe.filter((y) => citta(y.citta) === c && y.anno === a);
    return pct(somma(r, (y) => y.margine), somma(r, (y) => y.venduto)).padStart(8);
  });
  console.log([c.slice(0, 20).padEnd(20), String(x.n).padStart(7), pct(x.m, x.v).padStart(12), pct(x.m, MARG).padStart(17), ...cel].join(' |'));
}
const resto = [...perCitta.entries()].filter(([c]) => !top.some(([t]) => t === c));
const rv = somma(resto.map(([, x]) => x), (x) => x.v), rm = somma(resto.map(([, x]) => x), (x) => x.m);
console.log(`\naltre ${resto.length} citta': marginalita ${pct(rm, rv)} · peso sul margine ${pct(rm, MARG)}`);

console.log('\n================ LE PIU REDDITIZIE (almeno 20 ordini) ================');
const grandi = [...perCitta.entries()].filter(([, x]) => x.n >= 20).sort((a, b) => (b[1].m / b[1].v) - (a[1].m / a[1].v)).slice(0, 10);
console.log(['citta'.padEnd(20), 'ordini'.padStart(7), 'marginalita'.padStart(12), 'margine'.padStart(14)].join(' |'));
for (const [c, x] of grandi) {
  console.log([c.slice(0, 20).padEnd(20), String(x.n).padStart(7), pct(x.m, x.v).padStart(12), x.m.toLocaleString('it-IT', { minimumFractionDigits: 2 }).padStart(14)].join(' |'));
}
console.log('\n================ LE MENO REDDITIZIE (almeno 20 ordini) ================');
const peggio = [...perCitta.entries()].filter(([, x]) => x.n >= 20).sort((a, b) => (a[1].m / a[1].v) - (b[1].m / b[1].v)).slice(0, 10);
for (const [c, x] of peggio) {
  console.log([c.slice(0, 20).padEnd(20), String(x.n).padStart(7), pct(x.m, x.v).padStart(12), x.m.toLocaleString('it-IT', { minimumFractionDigits: 2 }).padStart(14)].join(' |'));
}

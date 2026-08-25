// ============================================================
// La regola FUORI CITTA': applicata, e dove?
// ------------------------------------------------------------
// Segnalata dall'utente il 25/08/2026: «sono consegne dove si applica il
// listino extra città, dovresti averlo in database» e «dovresti trovare anche
// la regola associata (se città di partenza è diversa da quella di arrivo)».
//
// ⭐ E RIBALTA UNA CONCLUSIONE MIA. Avevo classificato come difetto le consegne
// in cui la paga del valet coincide col numero dei chilometri. Su parecchie non
// e' un difetto: e' il listino. `Valet.extraOutOfCityPrice` vale **1,00 €/km
// per 44 valet** (e 0,90 per altri 21), e 1 €/km × 112,04 km fa esattamente
// 112,04 €. #55870 e #61057 sono corrette.
//
// Resta un difetto vero dove la distanza e' impossibile: #62976 aveva 579,63 km
// per una consegna dentro Roma, e 1 €/km su quel numero faceva 579,63 €. Li'
// sbagliava la DISTANZA, non la tariffa.
//
// ⚠️ `Delivery.extraOutOfCity` e' **false su tutte le 61.836 consegne**: la
// regola si vede negli importi ma il flag che la registra non e' mai stato
// scritto. Chi legge una consegna non puo' sapere se e' stata pagata come fuori
// citta' — lo puo' solo dedurre dal numero, che e' esattamente il modo in cui
// ci si sbaglia.
//
// COSA FA. Per ogni consegna con valet, distanza e listino:
//   - ricava la citta' di RITIRO e quella di CONSEGNA e le confronta;
//   - calcola le due paghe possibili — urbana
//     (`salary + extraKmPrice × max(0, km − inclusi)`) e fuori citta'
//     (`extraOutOfCityPrice × km`) — e guarda quale combacia con quella scritta;
//   - conta i casi in cui non combacia nessuna delle due.
//
// NON SCRIVE NIENTE.
//
// Uso: node scripts/verifica-regola-fuori-citta.mjs
// ============================================================
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;
const db = new PrismaClient();
const eu = (n) => (n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const pc = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');

/**
 * La citta' dentro un indirizzo italiano. Riconosce «…, 00187 Roma RM, Italia»
 * e le etichette secche («Milano», «Roma»).
 *
 * ⚠️ Torna `null` quando non e' sicura: una citta' indovinata qui diventerebbe
 * un «fuori citta'» inventato, e da li' una paga.
 */
function citta(indirizzo) {
  const a = String(indirizzo ?? '').trim();
  if (!a) return null;
  const conCap = a.match(/\b\d{5}\s+([^,]+?)(?:\s+[A-Z]{2})?\s*(?:,|$)/);
  if (conCap) return conCap[1].trim().toLowerCase();
  if (!a.includes(',') && a.length < 30) return a.toLowerCase();   // etichetta secca
  const pezzi = a.split(',').map((s) => s.trim()).filter(Boolean);
  return pezzi.length > 1 ? pezzi[pezzi.length - 2].replace(/\s+[A-Z]{2}$/, '').toLowerCase() : null;
}
const r2 = (x) => Math.round(x * 100) / 100;

try {
  const consegne = await db.delivery.findMany({
    where: { deletedAt: null, valetId: { not: null }, distanceKm: { gt: 0 } },
    select: { code: true, pickupAddress: true, recipientAddress: true, distanceKm: true,
      valetSalary: true, valetAdditionalPrice: true, extraOutOfCity: true, valetServiceId: true,
      partner: { select: { insegna: true } },
      valet: { select: { firstName: true, lastName: true, minimumKmIncluded: true, extraOutOfCityPrice: true } } },
  });
  console.log(`consegne con valet e distanza: ${consegne.length}`);

  // i listini, presi una volta sola
  const idServizi = [...new Set(consegne.map((c) => c.valetServiceId).filter(Boolean))];
  const listini = new Map((await db.valetService.findMany({
    where: { id: { in: idServizi } }, select: { id: true, salary: true, extraKmPrice: true },
  })).map((x) => [x.id, x]));

  let stessaCitta = 0, cittaDiverse = 0, cittaIgnota = 0;
  let combaciaUrbano = 0, combaciaFuori = 0, nessuna = 0, senzaListino = 0;
  const fuoriMaStessaCitta = [];   // il difetto vero: pagata fuori citta' ma la citta' e' la stessa
  const perValet = {};

  for (const d of consegne) {
    const paga = r2((d.valetSalary ?? 0) + (d.valetAdditionalPrice ?? 0));
    const cp = citta(d.pickupAddress), cc = citta(d.recipientAddress);
    const diverse = cp && cc ? cp !== cc : null;
    if (diverse === null) cittaIgnota++; else if (diverse) cittaDiverse++; else stessaCitta++;

    const t = d.valetServiceId ? listini.get(d.valetServiceId) : null;
    if (!t) { senzaListino++; continue; }
    const inclusi = d.valet?.minimumKmIncluded ?? 0;
    const urbano = r2(t.salary + (t.extraKmPrice ?? 0) * Math.max(0, d.distanceKm - inclusi));
    const tariffaFuori = d.valet?.extraOutOfCityPrice ?? 0;
    const fuori = r2(tariffaFuori * d.distanceKm);

    const eUrbano = Math.abs(paga - urbano) < 0.011;
    const eFuori = tariffaFuori > 0 && Math.abs(paga - fuori) < 0.011;
    if (eUrbano) combaciaUrbano++;
    else if (eFuori) {
      combaciaFuori++;
      if (diverse === false) {
        fuoriMaStessaCitta.push({ code: d.code, km: d.distanceKm, paga, citta: cp,
          partner: d.partner?.insegna, valet: `${d.valet?.firstName} ${d.valet?.lastName}` });
        const k = `${d.valet?.firstName} ${d.valet?.lastName}`;
        perValet[k] = (perValet[k] ?? 0) + 1;
      }
    } else nessuna++;
  }

  console.log(`\n=== citta' di ritiro contro citta' di consegna ===`);
  console.log(`  stessa citta' ....... ${stessaCitta} (${pc(stessaCitta, consegne.length)})`);
  console.log(`  citta' diverse ...... ${cittaDiverse} (${pc(cittaDiverse, consegne.length)})  ← qui vale il listino fuori citta'`);
  console.log(`  non determinabile ... ${cittaIgnota} (${pc(cittaIgnota, consegne.length)})`);

  console.log(`\n=== quale listino spiega la paga scritta ===`);
  console.log(`  urbano (base + €/km oltre gli inclusi) ... ${combaciaUrbano} (${pc(combaciaUrbano, consegne.length)})`);
  console.log(`  FUORI CITTA' (€/km su tutti i km) ........ ${combaciaFuori} (${pc(combaciaFuori, consegne.length)})`);
  console.log(`  nessuno dei due .......................... ${nessuna} (${pc(nessuna, consegne.length)})`);
  console.log(`  senza listino collegato .................. ${senzaListino}`);

  console.log(`\n🔴 pagate col listino FUORI CITTA' ma ritiro e consegna nella STESSA citta': ${fuoriMaStessaCitta.length}`);
  console.log(`   valgono ${eu(fuoriMaStessaCitta.reduce((s, x) => s + x.paga, 0))}`);
  if (Object.keys(perValet).length) {
    console.log('   per valet:', JSON.stringify(Object.entries(perValet).sort((a, b) => b[1] - a[1]).slice(0, 8)));
  }
  console.log('\n   le 15 piu alte:');
  fuoriMaStessaCitta.sort((a, b) => b.paga - a.paga).slice(0, 15).forEach((x) =>
    console.log(`     #${String(x.code).padEnd(7)} ${String(x.km).padStart(8)} km  ${eu(x.paga).padStart(11)}  ${String(x.citta).padEnd(14)} ${String(x.partner ?? '').slice(0, 20).padEnd(22)} ${x.valet}`));

  const conFlag = await db.delivery.count({ where: { deletedAt: null, extraOutOfCity: true } });
  console.log(`\n⚠️ consegne col flag \`extraOutOfCity\` acceso: ${conFlag} — la regola si vede negli importi, il flag non e' mai stato scritto.`);
} finally {
  await db.$disconnect();
}

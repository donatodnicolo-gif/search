// ============================================================
// Le paghe del 2026 che NESSUN listino spiega
// ------------------------------------------------------------
// Chiesto dall'utente il 25/08/2026, dopo che la verifica sulle regole ha
// trovato 12.446 consegne (il 46,5%) la cui paga non combacia ne' col listino
// urbano ne' con quello fuori citta'.
//
// ⚠️ «Non spiegata» non vuol dire «sbagliata». Prima di accusare una riga si
// provano TUTTE le forme plausibili della stessa tariffa, perche' una formula
// giusta applicata alla base sbagliata sembra un errore:
//   1. urbano ............. salary + extraKmPrice x max(0, km - inclusi)
//   2. urbano senza soglia. salary + extraKmPrice x km
//   3. fuori citta' ....... extraOutOfCityPrice x km
//   4. fuori citta' + base. salary + extraOutOfCityPrice x max(0, km - inclusi)
//   5. solo la base ....... salary   (nessun contributo dei km)
//   5-bis. A ORE .......... salary x max(ore, minimo del servizio)
//      ⚠️ Questa mancava alla prima passata, e da sola spiegava 302 delle 495
//      righe: il servizio piu' rappresentato fra le «non spiegate» era
//      «Servizio Ora con Approvazione», dove la paga non si calcola sui km
//      affatto. Misurare un servizio a ore con una formula a chilometri
//      produce uno scarto perfettamente inutile.
//   6. una delle sopra, ma al netto del plus/minus scritto sulla consegna
// Solo cio' che non rientra in nessuna di queste resta «non spiegata».
//
// NON SCRIVE NIENTE.
//
// Uso:  node scripts/paghe-non-spiegate-2026.mjs            (solo il 2026)
//       node scripts/paghe-non-spiegate-2026.mjs --anno=2025
//       node scripts/paghe-non-spiegate-2026.mjs --tutto     (tutto l'arretrato)
// ============================================================
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const TUTTO = process.argv.includes('--tutto');
const ANNO = Number((process.argv.find((a) => a.startsWith('--anno=')) ?? '--anno=2026').slice('--anno='.length));
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;
const db = new PrismaClient();
const eu = (n) => (n == null ? '—' : n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const pc = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
const r2 = (x) => Math.round(x * 100) / 100;
const uguale = (a, b) => Math.abs(a - b) < 0.011;

try {
  const da = new Date(Date.UTC(ANNO, 0, 1)), a = new Date(Date.UTC(ANNO + 1, 0, 1));
  const periodo = TUTTO ? {} : { date: { gte: da, lt: a } };
  const consegne = await db.delivery.findMany({
    where: { deletedAt: null, valetId: { not: null }, distanceKm: { gt: 0 }, ...periodo },
    select: { code: true, date: true, distanceKm: true, valetSalary: true, valetAdditionalPrice: true,
      hours: true, payable: true, valetServiceId: true, pickupAddress: true, recipientAddress: true,
      partner: { select: { insegna: true } },
      serviceType: { select: { name: true, pricingModel: true, minHours: true } },
      valet: { select: { firstName: true, lastName: true, minimumKmIncluded: true, extraOutOfCityPrice: true } } },
  });
  console.log(`${TUTTO ? "TUTTO L ARRETRATO" : ANNO}: consegne con valet e distanza: ${consegne.length}`);

  const idServizi = [...new Set(consegne.map((c) => c.valetServiceId).filter(Boolean))];
  const listini = new Map((await db.valetService.findMany({
    where: { id: { in: idServizi } },
    select: { id: true, salary: true, extraKmPrice: true, serviceType: { select: { name: true } } },
  })).map((x) => [x.id, x]));

  const classi = {};
  const nonSpiegate = [];
  for (const d of consegne) {
    const base = r2(d.valetSalary ?? 0);
    const plus = r2(d.valetAdditionalPrice ?? 0);
    const paga = r2(base + plus);
    const t = d.valetServiceId ? listini.get(d.valetServiceId) : null;
    const metti = (k) => { classi[k] = (classi[k] ?? 0) + 1; };

    if (!t) { metti('senza listino collegato'); nonSpiegate.push({ ...d, paga, perche: 'senza listino' }); continue; }
    const km = d.distanceKm;
    const inclusi = d.valet?.minimumKmIncluded ?? 0;
    const fuoriTariffa = d.valet?.extraOutOfCityPrice ?? 0;
    const candidati = [
      ['urbano', r2(t.salary + (t.extraKmPrice ?? 0) * Math.max(0, km - inclusi))],
      ['urbano senza soglia', r2(t.salary + (t.extraKmPrice ?? 0) * km)],
      ['fuori citta (€/km su tutti i km)', r2(fuoriTariffa * km)],
      ['fuori citta + base', r2(t.salary + fuoriTariffa * Math.max(0, km - inclusi))],
      ['solo la base', r2(t.salary)],
      // A ORE: la paga e' la tariffa moltiplicata per le ore, col minimo del
      // servizio. I km non c'entrano niente.
      ['a ore (tariffa x ore)', r2(t.salary * Math.max(d.hours ?? 0, d.serviceType?.minHours ?? 1))],
      ['a ore (ore esatte)', d.hours ? r2(t.salary * d.hours) : 0],
    ];
    // si prova sia sul totale sia sulla sola base (il plus/minus e' un'aggiunta a parte)
    const trovato = candidati.find(([, v]) => v > 0 && (uguale(paga, v) || uguale(base, v)));
    if (trovato) { metti(trovato[0]); continue; }
    if (paga === 0) { metti('paga a zero (non pagata)'); continue; }
    metti('NON SPIEGATA');
    nonSpiegate.push({ ...d, paga, base, plus, perche: 'nessuna formula combacia',
      urbano: candidati[0][1], fuori: candidati[2][1], listino: t });
  }

  console.log('\n=== come si spiega la paga ===');
  for (const [k, v] of Object.entries(classi).sort((x, y) => y[1] - x[1])) {
    console.log(`  ${k.padEnd(34)} ${String(v).padStart(6)}  ${pc(v, consegne.length)}`);
  }

  const vere = nonSpiegate.filter((x) => x.perche === 'nessuna formula combacia');
  console.log(`\n=== le NON SPIEGATE ${TUTTO ? "di tutto l arretrato" : "del " + ANNO}: ${vere.length} — ${eu(vere.reduce((s, x) => s + x.paga, 0))} ===`);
  if (TUTTO) {
    const perAnno = {};
    for (const x of vere) { const k = x.date.getUTCFullYear(); (perAnno[k] ??= []).push(x); }
    console.log("\n  per anno:");
    console.log("  | anno | non spiegate | paga | scarto dall urbano |");
    console.log("  |---|---|---|---|");
    for (const k of Object.keys(perAnno).sort()) {
      const g = perAnno[k];
      console.log(`  | ${k} | ${g.length} | ${eu(g.reduce((s, x) => s + x.paga, 0))} | ${eu(g.reduce((s, x) => s + x.paga - x.urbano, 0))} |`);
    }
  }
  console.log(`  di cui pagabili: ${vere.filter((x) => x.payable).length}`);
  console.log(`  con un plus/minus scritto sulla consegna: ${vere.filter((x) => x.plus !== 0).length}`);
  console.log(`  con la paga SOPRA quella urbana: ${vere.filter((x) => x.paga > x.urbano).length} (${eu(vere.filter((x) => x.paga > x.urbano).reduce((s, x) => s + x.paga - x.urbano, 0))} in piu')`);
  console.log(`  con la paga SOTTO quella urbana: ${vere.filter((x) => x.paga < x.urbano).length}`);

  const perPartner = {};
  const perValet = {};
  const perServizio = {};
  for (const x of vere) {
    const p = x.partner?.insegna ?? '—'; (perPartner[p] ??= []).push(x);
    const v = `${x.valet?.firstName} ${x.valet?.lastName}`; (perValet[v] ??= []).push(x);
    const s = x.serviceType?.name ?? '—'; (perServizio[s] ??= []).push(x);
  }
  const tabella = (titolo, mappa) => {
    console.log(`\n${titolo}`);
    console.log('| chi | consegne | paga totale | scarto dall\'urbano |');
    console.log('|---|---|---|---|');
    Object.entries(mappa).sort((a, b) => b[1].reduce((s, x) => s + x.paga, 0) - a[1].reduce((s, x) => s + x.paga, 0))
      .slice(0, 12).forEach(([k, g]) => console.log(`| ${k.slice(0, 28)} | ${g.length} | ${eu(g.reduce((s, x) => s + x.paga, 0))} | ${eu(g.reduce((s, x) => s + x.paga - x.urbano, 0))} |`));
  };
  tabella('per PARTNER:', perPartner);
  tabella('per VALET:', perValet);
  tabella('per SERVIZIO:', perServizio);

  console.log('\nle 20 con lo scarto piu grande rispetto al listino urbano:');
  console.log('| consegna | data | km | paga | urbano | fuori citta | partner | valet |');
  console.log('|---|---|---|---|---|---|---|---|');
  vere.sort((a, b) => (b.paga - b.urbano) - (a.paga - a.urbano)).slice(0, 20).forEach((x) =>
    console.log(`| ${x.code} | ${x.date.toISOString().slice(0, 10)} | ${x.distanceKm} | ${eu(x.paga)} | ${eu(x.urbano)} | ${eu(x.fuori)} | ${String(x.partner?.insegna ?? '—').slice(0, 20)} | ${x.valet?.firstName} ${x.valet?.lastName} |`));
} finally {
  await db.$disconnect();
}

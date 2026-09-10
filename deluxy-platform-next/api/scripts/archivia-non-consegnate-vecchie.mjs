/**
 * LE NON CONSEGNATE VECCHIE VANNO IN STORICO (10/09/2026, regola utente).
 *
 *   node api/scripts/archivia-non-consegnate-vecchie.mjs                (anteprima)
 *   node api/scripts/archivia-non-consegnate-vecchie.mjs --giorni 60    (anteprima con altra soglia)
 *   node api/scripts/archivia-non-consegnate-vecchie.mjs --giorni 60 --applica
 *
 * COSA VEDE UN PARTNER OGGI. Misurato su Clivati 1969: 2.049 consegne in tutto,
 * di cui 1.918 gia' consegnate e giustamente in Storico. Ma la vista che gli si
 * apre — «Attive», nessun filtro di data — gliene mostra **28**, e **26 sono
 * NON CONSEGNATE del 2021-2026** mai riconsegnate e mai chiuse. Le sue due
 * consegne vere di settembre stanno in mezzo a quel cimitero.
 * Su TUTTI i partner: 1.683 non consegnate aperte, di cui 1.679 piu' vecchie di
 * trenta giorni.
 *
 * COSA FA. Esattamente quello che fa il bottone «nascondi da consegne» del
 * dettaglio (`nascondiNonConsegnata`, deliveries.service.ts): scrive
 * `nonConsegnataChiusaIl` e lascia una riga nel registro della consegna.
 * NON cambia stato, NON cancella niente, ed e' REVERSIBILE una per una dal
 * dettaglio («rimetti fra le attive»).
 *
 * ⚠️ Tocca SOLO lo stato `not_delivered` senza figlie (mai riconsegnata) e piu'
 * vecchio della soglia. Le consegne aperte di oggi — «da gestire», «assegnata»,
 * le vendite in attesa di risposta del partner — non le sfiora: quelle sono
 * lavoro vero, e nasconderle vorrebbe dire farle sparire a chi deve rispondere.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const APPLICA = process.argv.includes('--applica');
const iG = process.argv.indexOf('--giorni');
const GIORNI = iG >= 0 ? Number(process.argv[iG + 1]) : 60;
const RADICE = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';

const require = createRequire(RADICE + 'api/package.json');
const { PrismaClient } = require('@prisma/client');
const rigaEnv = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });

const soglia = new Date(Date.now() - GIORNI * 24 * 3600 * 1000);
console.log(`soglia: consegne del ${soglia.toISOString().slice(0, 10)} o precedenti (${GIORNI} giorni)`);

const aperte = await db.delivery.findMany({
  where: {
    deletedAt: null,
    status: 'not_delivered',
    childDeliveries: { none: {} },
    nonConsegnataChiusaIl: null,
  },
  select: { id: true, code: true, date: true, partner: { select: { insegna: true } } },
  orderBy: { date: 'asc' },
});
console.log(`\nnon consegnate aperte in tutto: ${aperte.length}`);
const perAnno = aperte.reduce((a, d) => { const y = d.date.getUTCFullYear(); a[y] = (a[y] ?? 0) + 1; return a; }, {});
console.log('  per anno: ' + Object.entries(perAnno).map(([k, v]) => `${k}=${v}`).join(' · '));

// ⚠️ CHANEL NON SI TOCCA (regola permanente dell'utente). Sono 180 righe su
// tre insegne (Milano Montenapoleone, Milano Sant'Andrea, Firenze Deluxy): si
// contano e si lasciano dove sono. `--includi-chanel` le fa rientrare, ma
// dev'essere una scelta detta a voce, non un default.
const CHANEL = (d) => (d.partner?.insegna ?? '').toLowerCase().includes('chanel');
const INCLUDI_CHANEL = process.argv.includes('--includi-chanel');
const vecchie = aperte.filter((d) => d.date < soglia);
const chanel = vecchie.filter(CHANEL);
const daChiudere = INCLUDI_CHANEL ? vecchie : vecchie.filter((d) => !CHANEL(d));
const restano = aperte.length - vecchie.length;
console.log(`\n  ⚠️ Chanel, ${INCLUDI_CHANEL ? 'INCLUSE su richiesta' : 'escluse per regola'}: ${chanel.length}`);
console.log(`  ⇒ DA MANDARE IN STORICO: ${daChiudere.length}`);
console.log(`  restano fra le attive (piu' recenti della soglia): ${restano}`);

const perPartner = {};
for (const d of daChiudere) {
  const n = d.partner?.insegna ?? '—';
  perPartner[n] = (perPartner[n] ?? 0) + 1;
}
console.log('\n  i quindici partner che ne hanno di piu\':');
for (const [n, q] of Object.entries(perPartner).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`    ${String(q).padStart(4)} × ${n}`);
}
console.log(`\n  partner coinvolti in tutto: ${Object.keys(perPartner).length}`);

if (!APPLICA) {
  console.log('\nANTEPRIMA — niente scritto. Rilancia con --applica.');
  await db.$disconnect();
  process.exit(0);
}

let fatte = 0;
for (const d of daChiudere) {
  await db.delivery.update({
    where: { id: d.id },
    data: { nonConsegnataChiusaIl: new Date(), nonConsegnataChiusaDa: null },
  });
  await db.deliveryLog.create({
    data: {
      deliveryId: d.id,
      type: 'note',
      message: `Tolta dall'elenco Consegne senza riconsegna: resta in Storico (archiviazione delle non consegnate oltre ${GIORNI} giorni, 10/09/2026)`,
    },
  });
  fatte++;
  if (fatte % 200 === 0) console.log(`     … ${fatte}/${daChiudere.length}`);
}
console.log(`\n✓ MANDATE IN STORICO ${fatte} consegne. Nessuno stato cambiato, nessun dato perso:`);
console.log('  ognuna si rimette fra le attive dal suo dettaglio.');
const dopo = await db.delivery.count({
  where: { deletedAt: null, status: 'not_delivered', childDeliveries: { none: {} }, nonConsegnataChiusaIl: null },
});
console.log(`  non consegnate ancora aperte: ${dopo}`);
await db.$disconnect();

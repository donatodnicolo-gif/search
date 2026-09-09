/**
 * Allinea il LISTINO VALET di Sami Nicolas Chakroun ai servizi che fa davvero.
 *
 *   node api/scripts/listino-valet-sami.mjs             (anteprima, non scrive)
 *   node api/scripts/listino-valet-sami.mjs --applica
 *
 * ⚠️ PERCHÉ SERVE. Il suo listino ha due voci — «Consegna Standard»
 * (PREZZO_FISSO, 12,50 € + 0,70 €/km) e «Servizio a Ora» (A_ORA, 12,50 €) — ma
 * i servizi che gli assegnano sono ALTRI TRE: «Vendita Deluxy» (80 consegne da
 * agosto), «Servizio Consegna Standard» (55) e «Chanel Roma a ora» (17). Sono
 * `ServiceType` diversi, non gli stessi con un altro nome: senza una voce di
 * listino per il servizio della consegna, `pagaConsegna()` restituisce null e
 * la consegna resta FUORI dallo stipendio — non a zero, proprio fuori.
 *
 * Decisione dell'utente (09/09/2026): «si applica il concetto anche per vendite
 * e per le extra città si applica il prezzo per extra città». Quindi le voci
 * nuove nascono con la STESSA tariffa di quelle che ha già:
 *   · a prezzo fisso e vendita → 12,50 € + 0,70 €/km oltre i suoi 5 km inclusi;
 *   · a ora                    → 12,50 € l'ora.
 * Il FUORI CITTÀ non si tocca qui: viene dalla scheda valet
 * (`extraOutOfCityPrice` = 1 €/km) e vale già per tutti i suoi servizi — tutti i
 * km × 1 €, con il minimo della base urbana.
 *
 * ⚠️ NON tocca le voci che esistono già: se una tariffa è stata decisa, resta.
 * Ripetibile: guarda cosa c'è e aggiunge solo il mancante.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const APPLICA = process.argv.includes('--applica');
const require = createRequire('C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/api/package.json');
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });

const VALET = 'cmt5td5j301d0i6v4zx1b233k'; // Sami Nicolas Chakroun
const BASE = 12.5;
const KM = 0.7;

const valet = await db.valet.findUnique({
  where: { id: VALET },
  select: { firstName: true, lastName: true, minimumKmIncluded: true, extraOutOfCityPrice: true },
});
console.log(`VALET: ${valet.firstName} ${valet.lastName} · km inclusi ${valet.minimumKmIncluded} · fuori città ${valet.extraOutOfCityPrice} €/km`);

const gia = await db.valetService.findMany({
  where: { valetId: VALET },
  select: { serviceTypeId: true, salary: true, extraKmPrice: true, serviceType: { select: { name: true, pricingModel: true } } },
});
console.log(`\nLISTINO DI OGGI: ${gia.length} voci`);
for (const l of gia) {
  console.log(`   ${(l.serviceType?.name ?? '—').padEnd(32)} ${(l.serviceType?.pricingModel ?? '').padEnd(13)} ${l.salary ?? '—'} € · km ${l.extraKmPrice ?? '—'}`);
}

// I servizi che gli assegnano davvero, dal 01/08.
const usati = await db.delivery.groupBy({
  by: ['serviceTypeId'],
  where: { valetId: VALET, deletedAt: null, date: { gte: new Date('2026-08-01') } },
  _count: true,
});
const tipi = await db.serviceType.findMany({
  where: { id: { in: usati.map((x) => x.serviceTypeId).filter(Boolean) } },
  select: { id: true, name: true, pricingModel: true },
});
const hoGia = new Set(gia.map((l) => l.serviceTypeId));
const daAggiungere = [];
console.log('\nSERVIZI CHE GLI ASSEGNANO (dal 01/08):');
for (const x of usati.sort((a, b) => b._count - a._count)) {
  const t = tipi.find((y) => y.id === x.serviceTypeId);
  if (!t) continue;
  const c = hoGia.has(t.id);
  console.log(`   ${String(x._count).padStart(4)} × ${t.name.padEnd(32)} ${t.pricingModel.padEnd(13)} ${c ? 'a listino ✓' : '— MANCA'}`);
  if (!c) daAggiungere.push(t);
}

if (!daAggiungere.length) {
  console.log('\nNiente da aggiungere: il listino copre già tutti i servizi.');
  await db.$disconnect();
  process.exit(0);
}

console.log(`\nDA AGGIUNGERE: ${daAggiungere.length} voci`);
for (const t of daAggiungere) {
  // A ORA si paga il tempo e basta: niente extra km, né in città né fuori.
  const km = t.pricingModel === 'A_ORA' ? null : KM;
  console.log(`   ${t.name.padEnd(32)} ${t.pricingModel.padEnd(13)} ${BASE} €${km != null ? ` + ${km} €/km oltre i ${valet.minimumKmIncluded} inclusi` : ' l\'ora'}`);
}

if (!APPLICA) {
  console.log('\nANTEPRIMA — niente scritto. Rilancia con --applica.');
  await db.$disconnect();
  process.exit(0);
}

for (const t of daAggiungere) {
  await db.valetService.create({
    data: {
      valetId: VALET,
      serviceTypeId: t.id,
      salary: BASE,
      extraKmPrice: t.pricingModel === 'A_ORA' ? null : KM,
    },
  });
  console.log(`   scritta: ${t.name}`);
}
const dopo = await db.valetService.count({ where: { valetId: VALET } });
console.log(`\n✓ Listino di Sami: ${gia.length} → ${dopo} voci. Ora si può generare lo stipendio.`);
await db.$disconnect();

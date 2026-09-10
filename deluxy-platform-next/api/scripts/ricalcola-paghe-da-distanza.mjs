/**
 * QUANTO VALE LA DISTANZA NELLA PAGA DEL VALET (10/09/2026). NON SCRIVE NULLA.
 *
 *   node api/scripts/ricalcola-paghe-da-distanza.mjs
 *
 * ⚠️⚠️ PERCHE' NON SCRIVE — e perche' un ricalcolo di massa NON serve.
 * `pagaConsegna()` ha due strade, e la distanza entra in una sola:
 *
 *   · `valetSalary > 0` (paga CONGELATA sulla riga) → la funzione restituisce
 *     quel numero + gli extra, e la distanza NON la guarda nemmeno. Scrivere i
 *     km non cambia un centesimo, e riscrivere la paga vorrebbe dire cambiare
 *     quanto e' stato PROMESSO al valet quel giorno: non e' un ricalcolo, e'
 *     una decisione, e la prende una persona.
 *   · paga vuota → il numero si prende dal LISTINO al momento in cui si genera
 *     lo stipendio, e a quel punto usa la distanza che trova scritta. Quindi
 *     basta aver scritto i km: il ricalcolo avviene da solo, senza toccare
 *     niente.
 *
 * ⚠️ LA TRAPPOLA IN CUI SONO CADUTO IL 10/09, scritta qui perche' non si
 * ripeta: la prima versione azzerava `valetSalary` per «forzare il listino» e
 * confrontava il risultato con `d.valetSalary`. Due errori in uno — forzava una
 * strada che l'app non prende, e confrontava con un numero che NON e' la paga
 * (la paga vera e' `valetSalary + valetAdditionalPrice + regole`). Usciva
 * «#39018: 6 € → 800 €, +794» su 4,86 km: in realta' quella consegna ha
 * `valetAdditionalPrice = 794`, l'app paga 800 € da sempre e non cambia niente.
 * Su 5.470 righe avrebbe riscritto paghe vere con numeri inventati.
 *
 * Il confronto ONESTO e' un altro: la paga come l'app la calcola OGGI, contro
 * la stessa paga con la distanza tolta. Quella differenza e' — esattamente —
 * quello che i km valgono per i valet. Le funzioni sono importate dal build,
 * non riscritte.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const RADICE = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';
const require = createRequire(RADICE + 'api/package.json');
const { PrismaClient } = require('@prisma/client');
const { pagaConsegna, scegliListinoValet } = require(RADICE + 'api/dist/salaries/salaries.module.js');

const rigaEnv = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });

const consegne = await db.delivery.findMany({
  where: {
    deletedAt: null,
    payable: true,
    valetId: { not: null },
    status: { in: ['delivered', 'approved', 'not_delivered'] },
    NOT: { paymentStatus: 'paid' },
    salaryLines: { none: {} },
  },
  select: {
    id: true, code: true, date: true, distanceKm: true, hours: true,
    valetId: true, valetSalary: true, valetServiceId: true, serviceTypeId: true, status: true,
    extraOutOfCity: true, extraKm: true, valetAdditionalPrice: true,
    products: { select: { quantity: true } },
    serviceType: { select: { name: true, pricingModel: true, minHours: true } },
    valet: { select: { firstName: true, lastName: true, minimumKmIncluded: true, extraOutOfCityPrice: true } },
    deliveryRule: true,
    valetDeliveryRule: true,
  },
});
console.log(`consegne da pagare, con valet, mai entrate in uno stipendio: ${consegne.length}`);

const congelate = consegne.filter((d) => (d.valetSalary ?? 0) > 0);
const dalListino = consegne.filter((d) => !((d.valetSalary ?? 0) > 0));
console.log(`  con paga CONGELATA sulla riga (la distanza non le tocca): ${congelate.length}`);
console.log(`  con paga DAL LISTINO (qui la distanza conta):             ${dalListino.length}`);
console.log(`     di cui senza distanza scritta: ${dalListino.filter((d) => d.distanceKm == null).length}`);

const listini = await db.valetService.findMany({
  where: { valetId: { in: [...new Set(dalListino.map((d) => d.valetId))] } },
  include: { serviceType: { select: { pricingModel: true, minHours: true } } },
  orderBy: [{ validFrom: 'desc' }],
});
const perId = new Map(listini.map((l) => [l.id, l]));
const perValet = new Map();
for (const l of listini) {
  if (!perValet.has(l.valetId)) perValet.set(l.valetId, []);
  perValet.get(l.valetId).push(l);
}

// Quanto valgono i km, oggi, sulle consegne che la distanza ce l'hanno.
const conKm = dalListino.filter((d) => d.distanceKm != null && d.distanceKm > 0);
let valeDiPiu = 0, invariate = 0, senzaListino = 0;
const righe = [];
for (const d of conKm) {
  const listino = scegliListinoValet(d, perId, perValet);
  if (!listino) { senzaListino++; continue; }
  const oggi = pagaConsegna(d, listino, d.deliveryRule ?? null);
  const senza = pagaConsegna({ ...d, distanceKm: null, extraKm: 0 }, listino, d.deliveryRule ?? null);
  if (!oggi || !senza) { senzaListino++; continue; }
  const delta = Math.round((oggi.amount - senza.amount) * 100) / 100;
  if (Math.abs(delta) < 0.005) { invariate++; continue; }
  valeDiPiu++;
  righe.push({ d, delta, oggi: oggi.amount, senza: senza.amount });
}
const totale = Math.round(righe.reduce((s, x) => s + x.delta, 0) * 100) / 100;
console.log(`\nSUL GRUPPO CHE PAGA DAL LISTINO E HA I KM (${conKm.length} righe):`);
console.log(`  la distanza cambia la paga su: ${valeDiPiu} righe`);
console.log(`  non la cambia (dentro i km inclusi, o servizio a ora): ${invariate}`);
console.log(`  senza voce di listino (fuori dallo stipendio comunque): ${senzaListino}`);
console.log(`  ⇒ VALORE DEI KM PER I VALET: ${totale > 0 ? '+' : ''}${totale} €`);

console.log(`\nle dieci righe dove i km pesano di piu':`);
for (const x of [...righe].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10)) {
  const v = x.d.valet;
  console.log(`  #${String(x.d.code).padEnd(7)} ${x.d.date.toISOString().slice(0, 10)} ${`${v?.firstName} ${v?.lastName}`.padEnd(24)} ${String(x.d.distanceKm).padStart(6)} km  ${x.senza} € → ${x.oggi} €  (${x.delta > 0 ? '+' : ''}${x.delta})`);
}

const perValetTot = {};
for (const x of righe) {
  const n = `${x.d.valet?.firstName} ${x.d.valet?.lastName}`;
  perValetTot[n] = perValetTot[n] ?? { righe: 0, delta: 0 };
  perValetTot[n].righe++;
  perValetTot[n].delta = Math.round((perValetTot[n].delta + x.delta) * 100) / 100;
}
console.log(`\nper valet:`);
for (const [n, v] of Object.entries(perValetTot).sort((a, b) => b[1].delta - a[1].delta).slice(0, 12)) {
  console.log(`  ${n.padEnd(26)} ${String(v.righe).padStart(4)} righe  ${v.delta > 0 ? '+' : ''}${v.delta} €`);
}

console.log(`\n⇒ NIENTE DA SCRIVERE: queste paghe si calcolano dal listino quando`);
console.log(`  si genera lo stipendio, e a quel punto la distanza c'e' gia'.`);
await db.$disconnect();

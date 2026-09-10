/**
 * LE CONSEGNE SENZA DISTANZA: prima il vecchio database, poi Google (10/09/2026).
 *
 *   node api/scripts/sistema-distanze.mjs                      (anteprima, non scrive)
 *   node api/scripts/sistema-distanze.mjs --applica             (fase 1: travaso dal legacy, GRATIS)
 *   node api/scripts/sistema-distanze.mjs --google --applica    (fase 2: misura con Google, A PAGAMENTO)
 *
 * PERCHE'. I km oltre quelli inclusi nel listino entrano nella PAGA del valet:
 * una consegna senza distanza si paga come se fosse tutta dentro il minimo.
 *
 * FASE 1 — il vecchio gestionale ce l'ha gia'. `legacy/tabelle/delivery.csv` ha
 * 29.926 righe con `distance > 0`. L'aggancio e' `Delivery.legacyId`
 * (⚠️ NON `legacyOrderId`: quello aggancia 3 righe in tutto). Misurato il
 * 10/09: 1.216 delle nostre consegne senza distanza ce l'hanno nel vecchio.
 *
 * ⚠️ TETTO DI SANITA'. Il vecchio ha sporcizia nota: su 28.540 consegne che
 * hanno entrambe le distanze, 107 divergono — e sono righe da 590-630 km su
 * ordini urbani, dove il numero NOSTRO e' quello sano (stessa sporcizia gia'
 * corretta il 03/09: «1.239 avevano la distanza sopra i 50 km: azzerata»).
 * Quindi dal vecchio si accetta solo <= 50 km; il resto NON si scrive e si
 * elenca, perche' una spedizione vera sopra i 50 km esiste ma non si distingue
 * da una riga sporca senza guardarla.
 *
 * FASE 2 — quello che qui e' nato, qui si misura. Le consegne senza `legacyId`
 * non hanno un vecchio da interrogare: si chiede la strada a Google
 * (Directions, la stessa API dell'app), con memoria per coppia di indirizzi.
 * NON si misura Artista Locale: li' il ritiro segue il destinatario e la
 * distanza e' zero per regola.
 *
 * Non tocca MAI una distanza gia' scritta. Ripetibile.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const APPLICA = process.argv.includes('--applica');
const GOOGLE = process.argv.includes('--google');
const TETTO_KM = 50;
const RADICE = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';

const require = createRequire(RADICE + 'api/package.json');
const { PrismaClient } = require('@prisma/client');
const rigaEnv = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });

function leggiCsv(nome) {
  const testo = fs.readFileSync(
    path.join('C:/Users/nicol/app/deluxy-platform-next/legacy/tabelle', `${nome}.csv`), 'utf8');
  const righe = []; let riga = [], campo = '', inStr = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (inStr) {
      if (c === '"' && testo[i + 1] === '"') { campo += '"'; i++; continue; }
      if (c === '"') { inStr = false; continue; }
      campo += c; continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === ',') { riga.push(campo); campo = ''; continue; }
    if (c === '\n') { riga.push(campo); righe.push(riga); riga = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo || riga.length) { riga.push(campo); righe.push(riga); }
  const testa = righe.shift();
  return righe.map((r) => Object.fromEntries(testa.map((k, i) => [k, r[i]])));
}

console.log('='.repeat(74));
console.log(`FASE 1 — LE DISTANZE CHE IL VECCHIO GESTIONALE HA GIA' (tetto ${TETTO_KM} km)`);
console.log('='.repeat(74));

const vecchio = new Map();
for (const x of leggiCsv('delivery')) {
  const d = Number(x.distance);
  if (Number.isFinite(d) && d > 0) vecchio.set(Number(x.id), Math.round(d * 10) / 10);
}
console.log(`vecchio delivery.csv: ${vecchio.size} righe con distanza > 0`);

const senzaDistanza = await db.delivery.findMany({
  where: { distanceKm: null, deletedAt: null, legacyId: { not: null } },
  select: {
    id: true, code: true, legacyId: true, payable: true, status: true, paymentStatus: true,
    partner: { select: { insegna: true } },
  },
});
/**
 * ⚠️⚠️ ESITO DEL 10/09, MISURATO: dal vecchio NON C'E' NIENTE DA TRAVASARE.
 * Delle 1.216 candidate, **1.216 sono di «Artista Locale»** — il partner con
 * ritiro forzato sulla citta' del destinatario, dove la distanza e' zero per
 * regola. Quelle distanze le abbiamo **azzerate noi il 25/08**, e il registro
 * della consegna lo dice riga per riga: «Ritiro portato sulla citta' di
 * consegna (Messina); prima diceva "Milano". Scartata la distanza». Hanno tutte
 * paga 0. Ripescarle dal vecchio vorrebbe dire **rimettere l'errore che e'
 * stato corretto** — e la sola sotto i 50 km (#63020, ritiro e consegna nello
 * stesso paese, «50 km» dal vecchio) e' lo stesso errore, appena piu' piccolo.
 * Percio' Artista Locale si esclude PER REGOLA, non solo per tetto.
 */
const ARTISTA = (d) => (d.partner?.insegna ?? '').toLowerCase().includes('artista locale');
const candidate = senzaDistanza.filter((d) => vecchio.has(d.legacyId));
const artistaLocale = candidate.filter(ARTISTA);
const veri = candidate.filter((d) => !ARTISTA(d));
const dentroTetto = veri.filter((d) => vecchio.get(d.legacyId) <= TETTO_KM);
const fuoriTetto = veri.filter((d) => vecchio.get(d.legacyId) > TETTO_KM);
console.log(`nostre consegne legacy senza distanza: ${senzaDistanza.length}`);
console.log(`  con una distanza nel vecchio:        ${candidate.length}`);
console.log(`  ⚠️ Artista Locale, azzerate apposta il 25/08 (NON si toccano): ${artistaLocale.length}`);
console.log(`  ⇒ DA SCRIVERE (entro il tetto):      ${dentroTetto.length}`);
console.log(`  ⚠️ scartate perche' sopra ${TETTO_KM} km:    ${fuoriTetto.length}`);
if (fuoriTetto.length) {
  console.log('     ' + fuoriTetto.slice(0, 12).map((d) => `#${d.code}=${vecchio.get(d.legacyId)}km`).join(' · '));
  if (fuoriTetto.length > 12) console.log(`     … e altre ${fuoriTetto.length - 12}`);
}
const ancoraDaPagare = (d) =>
  d.payable && ['delivered', 'approved', 'not_delivered'].includes(d.status) && d.paymentStatus !== 'paid';
console.log(`  di cui ancora DA PAGARE (la paga puo' cambiare): ${dentroTetto.filter(ancoraDaPagare).length}`);

if (APPLICA && !GOOGLE) {
  let fatte = 0;
  for (const d of dentroTetto) {
    await db.delivery.update({ where: { id: d.id }, data: { distanceKm: vecchio.get(d.legacyId) } });
    fatte++;
    if (fatte % 200 === 0) console.log(`     … ${fatte}/${dentroTetto.length}`);
  }
  console.log(`\n✓ SCRITTE ${fatte} distanze dal vecchio gestionale (nessuna chiamata a Google).`);
  console.log(`  consegne ancora senza distanza: ${await db.delivery.count({ where: { distanceKm: null, deletedAt: null } })}`);
}

console.log('\n' + '='.repeat(74));
console.log('FASE 2 — QUELLE NATE QUI: la strada si chiede a Google');
console.log('='.repeat(74));

const nateQui = await db.delivery.findMany({
  where: { distanceKm: null, deletedAt: null, legacyId: null },
  select: {
    id: true, code: true, date: true, pickupAddress: true, recipientAddress: true,
    payable: true, status: true, paymentStatus: true, partner: { select: { insegna: true } },
  },
  orderBy: { date: 'desc' },
});
const misurabili = nateQui.filter((d) =>
  (d.pickupAddress ?? '').trim() && (d.recipientAddress ?? '').trim()
  && !(d.partner?.insegna ?? '').toLowerCase().includes('artista locale'));
console.log(`nate qui senza distanza: ${nateQui.length}`);
console.log(`  ⇒ MISURABILI (due indirizzi, non Artista Locale): ${misurabili.length}`);
console.log('  costo: una chiamata a Google per coppia di indirizzi DIVERSA');

if (!GOOGLE) {
  console.log('\n(la fase 2 parte solo con --google: costa. Anteprima finita.)');
  await db.$disconnect();
  process.exit(0);
}

// ⚠️ Il modello e' AppSetting (chiave = 'key'), come lo legge SettingsService.get().
const chiave = (await db.appSetting.findUnique({
  where: { key: 'googleMapsApiKey' }, select: { value: true },
}))?.value?.trim();
if (!chiave) {
  console.log("⚠️ chiave googleMapsApiKey assente nei settings: non si misura niente.");
  await db.$disconnect();
  process.exit(1);
}

const memoria = new Map();
async function distanza(origine, destinazione) {
  const k = origine.trim().toLowerCase() + ' -> ' + destinazione.trim().toLowerCase();
  if (memoria.has(k)) return memoria.get(k);
  const url = 'https://maps.googleapis.com/maps/api/directions/json?origin='
    + encodeURIComponent(origine.trim()) + '&destination=' + encodeURIComponent(destinazione.trim())
    + '&region=it&language=it&key=' + encodeURIComponent(chiave);
  let km = null;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const metri = data.routes?.[0]?.legs?.reduce((s, l) => s + (l.distance?.value ?? 0), 0) ?? 0;
    if (data.status === 'OK' && metri > 0) km = Math.round(metri / 100) / 10;
  } catch { km = null; }
  memoria.set(k, km);
  return km;
}

let misurate = 0, vuote = 0, chiamate = 0;
for (const d of misurabili) {
  const prima = memoria.size;
  const km = await distanza(d.pickupAddress, d.recipientAddress);
  if (memoria.size > prima) chiamate++;
  if (km == null) { vuote++; continue; }
  if (APPLICA) await db.delivery.update({ where: { id: d.id }, data: { distanceKm: km } });
  misurate++;
  if (misurate % 100 === 0) console.log(`     … ${misurate}/${misurabili.length} (chiamate a Google: ${chiamate})`);
}
console.log(`\n${APPLICA ? '✓ SCRITTE' : 'anteprima:'} ${misurate} distanze · non misurabili ${vuote}`);
console.log(`  chiamate a Google: ${chiamate} (coppie ripetute risparmiate: ${misurabili.length - chiamate})`);
if (APPLICA) {
  console.log(`  consegne ancora senza distanza: ${await db.delivery.count({ where: { distanceKm: null, deletedAt: null } })}`);
}
await db.$disconnect();

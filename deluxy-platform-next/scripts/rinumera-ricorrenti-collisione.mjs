/**
 * RINUMERA le consegne di piattaforma che occupano i numeri del legacy.
 *
 * ⚠️ Il fatto (30/08/2026): legacy e piattaforma battono LA STESSA
 * NUMERAZIONE. `Delivery.code` nasce come max(code)+1, e i servizi ricorrenti
 * hanno occupato 63043… mentre il legacy — ancora vivo — creava consegne con
 * gli stessi numeri. Le 92 nuove del legacy non potevano entrare.
 *
 * DECISIONE DELL'UTENTE (30/08): si rinumerano le consegne di piattaforma
 * (tutte `created`/`assigned`, nessuna consegnata o comunicata) e il numero
 * del legacy resta autorevole.
 *
 * ⚠️ La nuova numerazione parte da 100001, NON da max+1: rinumerare a max+1
 * rimetterebbe le piattaforma-nate esattamente davanti alla sequenza del
 * legacy, e la PROSSIMA sincronizzazione ricomincerebbe la collisione.
 * Da 100001 in poi le due numerazioni non si incontrano più (il legacy è a
 * ~63.300): le consegne nate qui vivono sopra i 100.000, quelle del legacy
 * sotto. `code` non è chiave di nessuna relazione (si aggancia per id cuid):
 * cambia solo il numero visibile.
 *
 * Simula di default; scrive con --applica; backup in
 * scripts/backup-rinumerazione.json; una riga di DeliveryLog su ognuna.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const APPLICA = process.argv.includes('--applica');
const QUI = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const BASE_NUOVA = 100000;

function leggi(nome) {
  const testo = fs.readFileSync(path.join(QUI, '..', 'legacy-2026-08-30', 'tabelle', `${nome}.csv`), 'utf8');
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
  if (campo !== '' || riga.length) { riga.push(campo); righe.push(riga); }
  const testa = righe[0].map((x) => x.trim());
  return righe.slice(1).filter((r) => r.some((v) => v !== '')).map((r) =>
    Object.fromEntries(testa.map((c, i) => [c, r[i] === 'NULL' ? null : r[i]])));
}

const rigaEnv = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();

// I numeri che il legacy reclama: consegne del nuovo export non ancora in casa.
const inCasa = new Set((await prisma.delivery.findMany({
  where: { legacyId: { not: null } }, select: { legacyId: true } })).map((d) => d.legacyId));
const reclamati = leggi('delivery')
  .map((r) => Number(r.id))
  .filter((id) => id > 63042 && !inCasa.has(id));
console.log('numeri reclamati dal legacy:', reclamati.length);

// Le piattaforma-nate che li occupano (legacyId NULL: le nostre).
const occupanti = await prisma.delivery.findMany({
  where: { code: { in: reclamati }, legacyId: null },
  select: { id: true, code: true, status: true, date: true, recurringServiceId: true },
  orderBy: { code: 'asc' },
});
console.log('da rinumerare:', occupanti.length);
const nonSicure = occupanti.filter((o) => !['created', 'assigned'].includes(o.status));
if (nonSicure.length) {
  console.error('⚠️ FERMO: ci sono consegne oltre created/assigned — vanno guardate una per una:');
  for (const o of nonSicure) console.error(`   #${o.code} ${o.status}`);
  process.exit(1);
}

// Nuovo numero: 100001, 100002… (ma MAI sotto un code già esistente lassù).
const [{ maxalto }] = await prisma.$queryRawUnsafe(
  `SELECT COALESCE(MAX(code), ${BASE_NUOVA})::int AS maxalto FROM platform."Delivery" WHERE code > ${BASE_NUOVA}`);
let prossimo = Math.max(BASE_NUOVA, maxalto) + 1;
const piano = occupanti.map((o) => ({ id: o.id, da: o.code, a: prossimo++ }));
for (const p of piano.slice(0, 5)) console.log(`  #${p.da} -> #${p.a}`);
console.log(`  … e altre ${Math.max(0, piano.length - 5)}`);

if (!APPLICA) {
  console.log('\nPROVA A VUOTO: niente scritto. Rilancia con --applica.');
} else {
  fs.writeFileSync(path.join(QUI, 'backup-rinumerazione.json'), JSON.stringify(piano, null, 2));
  let fatte = 0;
  for (const p of piano) {
    // Transazione per riga: il numero nuovo e la riga di registro nascono
    // insieme — una rinumerazione senza spiegazione scritta è un mistero
    // fra un mese.
    await prisma.$transaction([
      prisma.delivery.update({ where: { id: p.id }, data: { code: p.a } }),
      prisma.deliveryLog.create({ data: {
        deliveryId: p.id, type: 'rinumerata',
        message: `Rinumerata da #${p.da} a #${p.a}: il numero era stato emesso anche dal gestionale precedente (collisione delle numerazioni, 30/08/2026). Il numero del legacy resta a quella consegna.`,
      } }),
    ]);
    fatte++;
  }
  console.log('RINUMERATE:', fatte, '(backup in scripts/backup-rinumerazione.json)');
}
await prisma.$disconnect();

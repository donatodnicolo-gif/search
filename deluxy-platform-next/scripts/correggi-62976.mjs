// ============================================================
// #62976 — partner e luogo di ritiro, corretti a mano
// ------------------------------------------------------------
// Deciso dall'utente il 25/08/2026: «aggiorna in questo caso come partner
// Artista Locale e metti ritiro Roma».
//
// PERCHE'. La consegna porta un profumo di proprieta' DELUXY («Perfume», 210 €,
// NON_UNICO) da Trinita' dei Monti, a Roma. Il ritiro registrato era la stringa
// «Milano»: da li' una distanza di 579,63 km, e siccome la paga si calcola sui
// chilometri, quel numero e' diventato euro — 579,63 € per 1,4 km di strada.
//
// ⚠️ IL PARTNER CAMBIA RISPETTO AL LEGACY, e va detto: nel `delivery` originale
// `partnerId` vale 232 = «Lijoi Roma», e l'import l'ha riportato fedelmente
// (verificato: anagrafica identica di qua e di la'). La correzione e' una
// decisione dell'utente sul merito — chi ha davvero eseguito la consegna — non
// la riparazione di un errore di importazione. Resta scritta nel registro.
//
// ⚠️ LA PAGA NON SI TOCCA QUI. Dal listino del valet verrebbe 13,48 €, ma
// l'utente ne ha in mente 15 e la regola carnet ne farebbe 0: sono tre numeri
// diversi e la scelta e' sua. Questo script sistema solo cio' che e' stato
// chiesto senza ambiguita': partner, ritiro e distanza.
//
// PROVA A VUOTO DI DEFAULT. Si applica con --scrivi.
// ============================================================
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const SCRIVI = process.argv.includes('--scrivi');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;
const db = new PrismaClient();

/** Centro di Roma, per la distanza in linea d'aria. */
const ROMA = [41.8931, 12.4828];
function kmInLineaDAria(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

try {
  const d = await db.delivery.findFirst({
    where: { code: 62976 },
    select: { id: true, code: true, pickupAddress: true, distanceKm: true, valetSalary: true,
      latitude: true, longitude: true, recipientAddress: true,
      partnerId: true, partner: { select: { insegna: true, legacyId: true } } },
  });
  if (!d) { console.error('#62976 non trovata.'); process.exit(1); }

  const nuovo = await db.partner.findFirst({
    where: { insegna: { equals: 'Artista Locale', mode: 'insensitive' } },
    select: { id: true, insegna: true },
  });
  if (!nuovo) { console.error('Partner «Artista Locale» non trovato: non tocco niente.'); process.exit(1); }

  const km = Math.round(kmInLineaDAria(ROMA[0], ROMA[1], d.latitude, d.longitude) * 100) / 100;

  console.log('#62976');
  console.log(`  partner   ${d.partner?.insegna} (legacyId ${d.partner?.legacyId})  →  ${nuovo.insegna}`);
  console.log(`  ritiro    ${JSON.stringify(d.pickupAddress)}  →  "Roma"`);
  console.log(`  distanza  ${d.distanceKm} km  →  ${km} km  (centro di Roma → ${d.recipientAddress})`);
  console.log(`  paga      ${d.valetSalary} €  →  invariata (la decide l'utente)`);

  if (!SCRIVI) { console.log('\nPROVA A VUOTO — non ho scritto niente. Rilancia con --scrivi.'); process.exit(0); }

  fs.writeFileSync('scripts/backup-62976.json', JSON.stringify(
    { id: d.id, code: d.code, partnerId: d.partnerId, pickupAddress: d.pickupAddress, distanceKm: d.distanceKm }, null, 1));

  await db.$transaction([
    db.delivery.update({ where: { id: d.id },
      data: { partnerId: nuovo.id, pickupAddress: 'Roma', distanceKm: km } }),
    db.deliveryLog.create({ data: { deliveryId: d.id, type: 'partner-e-ritiro-corretti',
      message: `Partner ${d.partner?.insegna} → ${nuovo.insegna} e ritiro «${d.pickupAddress}» → «Roma», su decisione dell'utente. `
        + `Distanza ${d.distanceKm} → ${km} km, dal centro di Roma all'indirizzo di consegna, IN LINEA D'ARIA (la chiave mappe non è configurata). `
        + `⚠️ Nel database originario il partner era «Lijoi Roma» (partnerId 232) e l'import l'aveva riportato fedelmente: questa è una correzione di merito, non di importazione. `
        + `La paga del valet resta ${d.valetSalary} € e va decisa a parte.` } }),
  ]);
  console.log('\nfatto, con la riga nel registro. Backup in scripts/backup-62976.json');
} finally {
  await db.$disconnect();
}

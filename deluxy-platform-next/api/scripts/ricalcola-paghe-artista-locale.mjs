/**
 * ARTISTA LOCALE — rimette in scala le paghe nate da una distanza sbagliata.
 *
 * DA DOVE VIENE. Le consegne di questo partner avevano il ritiro su un'etichetta
 * generica («Milano») e una distanza misurata da lì: 600,75 km per una consegna
 * interna a Roma. Dove la paga si calcola sui chilometri, quel numero è
 * diventato euro. Corretti i ritiri (correggi-ritiri-artista-locale.mjs),
 * restano 27 consegne con una paga fuori scala: da 58,67 a 600,75 €, contro i
 * 15-37 € che gli stessi valet prendono nello stesso giorno.
 *
 * COME SI RICALCOLA (deciso dall'utente il 25/08/2026)
 *   - distanza = dal CENTRO della città di consegna all'indirizzo del
 *     destinatario, in linea d'aria (formula dell'emisenoverso). ⚠️ NON sono km
 *     stradali: la chiave Google Maps della piattaforma è vuota, quindi non si
 *     possono chiedere. In città la strada è tipicamente il 20-30% in più.
 *   - paga = tariffa «Consegna Standard» DEL VALET:
 *     `salary + extraKmPrice × max(0, km − minimumKmIncluded)`,
 *     la stessa formula di `calculations.fixedPrice` nel ramo "in città".
 *     ⚠️ Si usa «Consegna Standard» perché il servizio vero di queste consegne
 *     («Vendita Deluxy») NON ha una tariffa configurata per nessuno di questi
 *     valet: è il difetto a monte, e finché resta ogni consegna di quel tipo
 *     nascerà senza una regola.
 *
 * COSA SCRIVE: `valetSalary` e `distanceKm` (la distanza si salva, o una paga
 * senza la sua base non è più spiegabile da chi legge la consegna), più una
 * riga nel registro che dice il prima, il dopo e che i km sono in linea d'aria.
 *
 * USO (di default NON scrive)
 *   DATABASE_URL="postgresql://…?schema=platform" node scripts/ricalcola-paghe-artista-locale.mjs
 *   DATABASE_URL="…" node scripts/ricalcola-paghe-artista-locale.mjs --applica
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const APPLICA = process.argv.includes('--applica');
const SOGLIA_PAGA = 50; // sopra questa cifra la paga non è di una consegna urbana

/** Centri delle città toccate. Coordinate del centro cittadino, non di un indirizzo. */
const CENTRI = {
  Roma: [41.8931, 12.4828],
  Firenze: [43.7714, 11.2542],
  'Sesto Fiorentino': [43.8306, 11.1985],
  'Lastra a Signa': [43.7686, 11.1128],
  Ranco: [45.7997, 8.5717],
  Piacenza: [45.0526, 9.693],
  Bergamo: [45.6949, 9.67],
};

/** Distanza in linea d'aria fra due punti (km). */
function kmInLineaDAria(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const prisma = new PrismaClient();

const standard = await prisma.serviceType.findFirst({
  where: { name: 'Consegna Standard' },
  select: { id: true },
});
if (!standard) {
  console.error('Servizio «Consegna Standard» non trovato: non tocco niente.');
  process.exit(1);
}

const partner = await prisma.partner.findFirst({
  where: { insegna: { equals: 'Artista Locale', mode: 'insensitive' } },
  select: { id: true },
});
if (!partner) {
  console.error('Partner «Artista Locale» non trovato: non tocco niente.');
  process.exit(1);
}

const consegne = await prisma.delivery.findMany({
  where: {
    partnerId: partner.id,
    deletedAt: null,
    distanceKm: null,
    valetSalary: { gt: SOGLIA_PAGA },
  },
  select: {
    id: true, code: true, pickupAddress: true, recipientAddress: true,
    latitude: true, longitude: true, valetSalary: true, payable: true, valetId: true,
  },
  orderBy: { valetSalary: 'desc' },
});

const lavori = [];
const scartate = [];
for (const d of consegne) {
  const centro = CENTRI[d.pickupAddress ?? ''];
  if (!centro || d.latitude == null || d.longitude == null) {
    scartate.push({ code: d.code, perche: !centro ? `centro sconosciuto (${d.pickupAddress})` : 'consegna senza coordinate' });
    continue;
  }
  const tariffa = d.valetId
    ? await prisma.valetService.findFirst({
        where: { valetId: d.valetId, serviceTypeId: standard.id },
        select: { salary: true, extraKmPrice: true },
      })
    : null;
  const valet = d.valetId
    ? await prisma.valet.findUnique({ where: { id: d.valetId }, select: { minimumKmIncluded: true, firstName: true, lastName: true } })
    : null;
  if (!tariffa || tariffa.salary == null) {
    scartate.push({ code: d.code, perche: 'il valet non ha la tariffa «Consegna Standard»' });
    continue;
  }
  const km = Math.round(kmInLineaDAria(centro[0], centro[1], d.latitude, d.longitude) * 100) / 100;
  const inclusi = valet?.minimumKmIncluded ?? 0;
  const paga =
    Math.round((tariffa.salary + (tariffa.extraKmPrice ?? 0) * Math.max(0, km - inclusi)) * 100) / 100;
  lavori.push({
    id: d.id, code: d.code, citta: d.pickupAddress, payable: d.payable,
    valet: valet ? `${valet.firstName} ${valet.lastName}` : '—',
    pagaPrima: d.valetSalary, pagaDopo: paga, km, base: tariffa.salary,
    extraKm: tariffa.extraKmPrice ?? 0, inclusi,
  });
}

const somma = (f) => lavori.reduce((s, l) => s + f(l), 0).toFixed(2);
console.log(
  `Consegne sopra ${SOGLIA_PAGA} € senza distanza: ${consegne.length}\n` +
  `Ricalcolabili: ${lavori.length}  (pagabili: ${lavori.filter((l) => l.payable).length})\n` +
  `Scartate: ${scartate.length}${scartate.length ? ' → ' + scartate.map((s) => `${s.code}: ${s.perche}`).join(' · ') : ''}\n` +
  `Paga attuale: ${somma((l) => l.pagaPrima)} €  →  ricalcolata: ${somma((l) => l.pagaDopo)} €`,
);

if (!APPLICA) {
  console.log('\nSimulazione: non ho scritto niente. Rilancia con --applica.');
  await prisma.$disconnect();
  process.exit(0);
}

const backup = 'scripts/backup-paghe-artista-locale.json';
fs.writeFileSync(
  backup,
  JSON.stringify(lavori.map((l) => ({ id: l.id, code: l.code, valetSalary: l.pagaPrima, distanceKm: null })), null, 1),
);
console.log(`\nValori vecchi salvati in ${backup} (serve per disfare).`);

for (const l of lavori) {
  await prisma.$transaction([
    prisma.delivery.update({
      where: { id: l.id },
      data: { valetSalary: l.pagaDopo, distanceKm: l.km },
    }),
    prisma.deliveryLog.create({
      data: {
        deliveryId: l.id,
        type: 'paga-ricalcolata',
        message:
          `Paga ricalcolata: ${l.pagaPrima} € → ${l.pagaDopo} €. ` +
          `Distanza ${l.km} km dal centro di ${l.citta} all'indirizzo di consegna, IN LINEA D'ARIA (la chiave mappe non è configurata: i km stradali sono più alti). ` +
          `Tariffa «Consegna Standard» del valet: base ${l.base} € + ${l.extraKm} €/km oltre ${l.inclusi} km. ` +
          `La paga di prima nasceva da una distanza misurata dal ritiro sbagliato.`,
      },
    }),
  ]);
}

console.log(`\nFatto: ${lavori.length} paghe ricalcolate, ognuna con la sua riga nel registro.`);
await prisma.$disconnect();

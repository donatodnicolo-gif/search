/**
 * ARTISTA LOCALE — porta lo STORICO alla regola nuova.
 *
 * La regola (deliveries.service.ts, 25/08/2026): per Artista Locale il ritiro è
 * nella città del destinatario, e una distanza sopra i 50 km non è una consegna
 * lunga ma un'origine sbagliata. Questo script applica la stessa regola alle
 * consegne già in archivio.
 *
 * COSA TOCCA
 *   - `pickupAddress` → la città del destinatario (solo dove è riconoscibile);
 *   - `distanceKm`    → null, SOLO dove superava i 50 km (dove è plausibile si
 *                       lascia: si toglie ciò che è dimostrabilmente sbagliato,
 *                       non ciò che è semplicemente sospetto).
 *
 * COSA NON TOCCA — e non è una dimenticanza
 *   - `valetSalary`: è denaro già maturato e in buona parte già pagato.
 *     Ricalcolarlo è una rettifica verso dei collaboratori, non una correzione
 *     tecnica: si decide a parte.
 *   - Le fatture partner: verificato prima di scrivere che `extraKm` è 0 su
 *     tutte le 2.568 consegne del partner e `price > 0` solo su 3 (150 € in
 *     tutto), quindi il supplemento chilometrico non ha mai fatturato niente.
 *
 * USO (di default NON scrive: stampa cosa farebbe)
 *   DATABASE_URL="postgresql://…?schema=platform" node scripts/correggi-ritiri-artista-locale.mjs
 *   DATABASE_URL="…" node scripts/correggi-ritiri-artista-locale.mjs --applica
 *
 * Prima di scrivere salva SEMPRE i valori vecchi in un file JSON accanto allo
 * script: senza quello la correzione non si può disfare.
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const PARTNER = 'artista locale';
const KM_MASSIMI_IN_CITTA = 50;
const APPLICA = process.argv.includes('--applica');

/** Copia esatta di `cittaDaIndirizzo` in deliveries.service.ts. */
function cittaDaIndirizzo(indirizzo) {
  if (!indirizzo) return null;
  const parti = indirizzo.split(',').map((x) => x.trim()).filter(Boolean);
  while (parti.length && /^(italia|italy)$/i.test(parti[parti.length - 1])) parti.pop();
  if (!parti.length) return null;
  const ultima = parti[parti.length - 1];
  if (/^[A-Z]{2}$/.test(ultima) && parti.length >= 2) {
    return parti[parti.length - 2].replace(/^\d{5}\s*/, '').trim() || null;
  }
  const conCap = ultima.match(/^\d{5}\s+(.+?)\s+[A-Z]{2}$/);
  if (conCap) return conCap[1].trim();
  const senzaCap = ultima.match(/^(.+?)\s+[A-Z]{2}$/);
  if (senzaCap) return senzaCap[1].replace(/^\d{5}\s*/, '').trim() || null;
  return null;
}

const prisma = new PrismaClient();

const partner = await prisma.partner.findFirst({
  where: { insegna: { equals: 'Artista Locale', mode: 'insensitive' } },
  select: { id: true, insegna: true },
});
if (!partner || partner.insegna.trim().toLowerCase() !== PARTNER) {
  console.error('Partner «Artista Locale» non trovato: non tocco niente.');
  process.exit(1);
}

const consegne = await prisma.delivery.findMany({
  where: { partnerId: partner.id, deletedAt: null },
  select: {
    id: true, code: true, pickupAddress: true, recipientAddress: true,
    distanceKm: true, valetSalary: true,
  },
  orderBy: { code: 'asc' },
});

const lavori = [];
let senzaCitta = 0;
for (const d of consegne) {
  const citta = cittaDaIndirizzo(d.recipientAddress);
  if (!citta) { senzaCitta++; continue; }
  const cambiaRitiro = citta !== (d.pickupAddress ?? '');
  const scartaKm = d.distanceKm != null && d.distanceKm > KM_MASSIMI_IN_CITTA;
  if (!cambiaRitiro && !scartaKm) continue;
  lavori.push({
    id: d.id, code: d.code, citta, cambiaRitiro, scartaKm,
    prima: { pickupAddress: d.pickupAddress, distanceKm: d.distanceKm },
    valetSalary: d.valetSalary,
  });
}

const kmScartati = lavori.filter((l) => l.scartaKm);
console.log(
  `Partner: ${partner.insegna}\n` +
  `Consegne in archivio: ${consegne.length}\n` +
  `Città non riconosciuta (lasciate stare): ${senzaCitta}\n` +
  `Da correggere: ${lavori.length}  (ritiro: ${lavori.filter((l) => l.cambiaRitiro).length} · km sopra ${KM_MASSIMI_IN_CITTA}: ${kmScartati.length})\n` +
  `Paghe valet legate ai km scartati (NON toccate): ${kmScartati.reduce((s, l) => s + (l.valetSalary ?? 0), 0).toFixed(2)} €`,
);

if (!APPLICA) {
  console.log('\nSimulazione: non ho scritto niente. Rilancia con --applica.');
  await prisma.$disconnect();
  process.exit(0);
}

const backup = `scripts/backup-ritiri-artista-locale.json`;
fs.writeFileSync(backup, JSON.stringify(lavori.map((l) => ({ id: l.id, code: l.code, ...l.prima })), null, 1));
console.log(`\nValori vecchi salvati in ${backup} (serve per disfare).`);

let scritte = 0;
for (let i = 0; i < lavori.length; i += 100) {
  const blocco = lavori.slice(i, i + 100);
  await prisma.$transaction(
    blocco.flatMap((l) => [
      prisma.delivery.update({
        where: { id: l.id },
        data: {
          ...(l.cambiaRitiro ? { pickupAddress: l.citta } : {}),
          ...(l.scartaKm ? { distanceKm: null } : {}),
        },
      }),
      prisma.deliveryLog.create({
        data: {
          deliveryId: l.id,
          type: 'ritiro-forzato',
          message:
            (l.cambiaRitiro
              ? `Ritiro portato sulla città di consegna (${l.citta}); prima diceva «${l.prima.pickupAddress ?? '—'}». `
              : '') +
            (l.scartaKm
              ? `Scartata la distanza di ${l.prima.distanceKm} km, misurata da un'altra origine (soglia ${KM_MASSIMI_IN_CITTA} km). La paga del valet non è stata toccata.`
              : ''),
        },
      }),
    ]),
  );
  scritte += blocco.length;
  console.log(`  …${scritte}/${lavori.length}`);
}

console.log(`\nFatto: ${scritte} consegne corrette, ognuna con la sua riga nel registro della consegna.`);
await prisma.$disconnect();

/**
 * RIPARA le consegne nate senza provincia né coordinate.
 *
 * ⚠️ Correggere il codice non basta: va corretto anche ciò che il codice ha
 * già scritto. Erano 94 nate in questa app (100%) più 91 dai ricorrenti — e
 * una consegna senza provincia sparisce dai filtri per zona e dall'ambito dei
 * team leader senza che nessuno lo noti.
 *
 * ⚠️ Si geocodifica UNA volta per INDIRIZZO distinto, non per consegna: le
 * consegne di un ricorrente sono decine allo stesso indirizzo, e sarebbero
 * decine di chiamate a Google per la stessa risposta.
 *
 * ⚠️ Tocca SOLO le consegne senza provincia: quelle che ce l'hanno non si
 * riscrivono: la geocodifica è un ripiego, non un'autorità.
 *
 * Con `--prova` non scrive niente e dice solo che cosa farebbe.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const SOLO_PROVA = process.argv.includes('--prova');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
const db = new PrismaClient({
  datasources: { db: { url: `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=1` } },
});

const chiaveGoogle = (await db.appSetting.findUnique({ where: { key: 'googleMapsApiKey' } }))?.value?.trim();
if (!chiaveGoogle) {
  console.log('La chiave googleMapsApiKey non è impostata: senza, non si può geocodificare niente.');
  await db.$disconnect();
  process.exit(1);
}

// Solo quelle nate QUI (senza legacyId): le importate senza provincia sono
// 31.987 e la loro riparazione è una decisione a parte, non un effetto
// collaterale di questa.
const daRiparare = await db.delivery.findMany({
  where: { legacyId: null, deletedAt: null, provinceId: null, recipientAddress: { not: '' } },
  select: { id: true, code: true, recipientAddress: true, latitude: true },
});
const indirizzi = [...new Set(daRiparare.map((d) => d.recipientAddress.trim()))];
console.log(`consegne da riparare: ${daRiparare.length} · indirizzi DISTINTI da geocodificare: ${indirizzi.length}`);
if (SOLO_PROVA) console.log('(prova: non scrivo niente)\n'); else console.log('');

const province = new Map((await db.province.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]));
const luoghi = new Map();
for (const ind of indirizzi) {
  const url = 'https://maps.googleapis.com/maps/api/geocode/json?address='
    + encodeURIComponent(ind) + '&region=it&language=it&key=' + encodeURIComponent(chiaveGoogle);
  try {
    const r = await (await fetch(url)).json();
    const primo = r.results?.[0];
    if (r.status !== 'OK' || !primo) {
      console.log(`  ✘ «${ind.slice(0, 58)}» → ${r.status}`);
      luoghi.set(ind, null);
      continue;
    }
    const p = primo.address_components?.find((c) => (c.types ?? []).includes('administrative_area_level_2'));
    const codice = p?.short_name ?? null;
    const provinceId = codice ? province.get(codice) ?? null : null;
    luoghi.set(ind, { lat: primo.geometry?.location?.lat ?? null, lng: primo.geometry?.location?.lng ?? null, provinceId, codice });
    console.log(`  ✔ «${ind.slice(0, 58)}» → ${codice ?? '(nessuna provincia)'}${codice && !provinceId ? ' ⚠️ non è fra le nostre province' : ''}`);
  } catch (e) {
    console.log(`  ✘ «${ind.slice(0, 58)}» → ${e.message.slice(0, 40)}`);
    luoghi.set(ind, null);
  }
}

let scritte = 0, senza = 0;
for (const d of daRiparare) {
  const l = luoghi.get(d.recipientAddress.trim());
  if (!l || !l.provinceId) { senza++; continue; }
  if (!SOLO_PROVA) {
    await db.delivery.update({
      where: { id: d.id },
      data: {
        provinceId: l.provinceId,
        // Le coordinate solo se mancano: non si riscrive una posizione già nota.
        ...(d.latitude == null ? { latitude: l.lat, longitude: l.lng } : {}),
      },
    });
  }
  scritte++;
}
console.log(`\n${SOLO_PROVA ? 'da scrivere' : 'scritte'}: ${scritte} · restano senza provincia: ${senza}`);
if (!SOLO_PROVA) {
  const rimaste = await db.delivery.count({ where: { legacyId: null, deletedAt: null, provinceId: null } });
  console.log(`verifica: consegne nate qui ancora senza provincia: ${rimaste}`);
}
await db.$disconnect();

/**
 * CONTROLLO CONSEGNE 01/08 → oggi (03/09, ordine utente) con RIPARAZIONE del
 * ritiro vuoto:
 *  - report di completezza (ritiro, consegna, fascia, provincia);
 *  - dove il RITIRO manca: si scrive l'indirizzo del PARTNER; per «Artista
 *    Locale» (ritiro nella città di consegna) la CITTÀ del destinatario —
 *    stessa regola del server (ritiroInCittaDiConsegna).
 * Anteprima di default; scrive con --applica (backup + log su ogni riga).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();
for (let t = 1; t <= 5; t++) {
  try { await prisma.$queryRaw`SELECT 1`; break; }
  catch (e) { if (t === 5) { console.error('DB irraggiungibile'); process.exit(1); } await new Promise((r) => setTimeout(r, 4000)); }
}

// Copia fedele di cittaDaIndirizzo (per il caso «Artista Locale»).
function cittaDaIndirizzo(ind) {
  if (!ind) return null;
  const parti = ind.split(',').map((x) => x.trim()).filter(Boolean);
  while (parti.length && /^(italia|italy)$/i.test(parti[parti.length - 1])) parti.pop();
  if (!parti.length) return null;
  const ultima = parti[parti.length - 1];
  if (/^[A-Z]{2}$/.test(ultima) && parti.length >= 2) {
    const c = parti[parti.length - 2].replace(/^\d{5}\s*/, '').trim();
    return c || null;
  }
  const conCap = ultima.match(/^\d{5}\s+(.+?)\s+[A-Z]{2}$/);
  if (conCap) return conCap[1].trim();
  const senzaCap = ultima.match(/^(.+?)\s+[A-Z]{2}$/);
  if (senzaCap) {
    const c = senzaCap[1].replace(/^\d{5}\s*/, '').trim();
    if (!c || /\d/.test(c) || c.length > 40) return null;
    return c;
  }
  return null;
}

const DA = new Date('2026-08-01'), A = new Date('2026-09-04');
const tutte = await prisma.delivery.findMany({
  where: { deletedAt: null, date: { gte: DA, lt: A } },
  select: { id: true, code: true, date: true, status: true, pickupAddress: true,
    recipientAddress: true, deliveryTimeFrom: true, provinceId: true,
    partner: { select: { insegna: true, address: true } } },
  orderBy: [{ date: 'asc' }, { code: 'asc' }],
});
const vuoto = (s) => !s || !s.trim();
console.log(`Consegne 01/08 → 03/09: ${tutte.length}`);
console.log('· senza indirizzo di RITIRO:', tutte.filter((c) => vuoto(c.pickupAddress)).length);
console.log('· senza indirizzo di CONSEGNA:', tutte.filter((c) => vuoto(c.recipientAddress)).length);
console.log('· senza FASCIA oraria:', tutte.filter((c) => vuoto(c.deliveryTimeFrom)).length);
console.log('· senza PROVINCIA salvata:', tutte.filter((c) => !c.provinceId).length);
console.log('');

const daRiparare = [];
for (const c of tutte.filter((x) => vuoto(x.pickupAddress))) {
  const insegna = (c.partner?.insegna ?? '').trim().toLowerCase();
  let nuovo = null, fonte = '';
  if (insegna === 'artista locale') {
    nuovo = cittaDaIndirizzo(c.recipientAddress);
    fonte = 'città di consegna (regola Artista Locale)';
  } else if (!vuoto(c.partner?.address)) {
    nuovo = c.partner.address.trim();
    fonte = 'indirizzo del partner';
  }
  if (nuovo) daRiparare.push({ c, nuovo, fonte });
  else console.log(`   ✋ #${c.code} ${c.date.toISOString().slice(0, 10)} · ${c.partner?.insegna ?? '—'}: NON riparabile (partner senza indirizzo)`);
}
console.log(`Ritiri vuoti riparabili: ${daRiparare.length}`);
for (const { c, nuovo, fonte } of daRiparare) {
  console.log(`   #${c.code} | ${c.date.toISOString().slice(0, 10)} | ${c.status} | ${c.partner?.insegna ?? '—'} | ritiro: — → ${nuovo} | (${fonte})`);
}

if (!APPLICA) { console.log('\nANTEPRIMA: niente scritto. Rilanciare con --applica.'); await prisma.$disconnect(); process.exit(0); }

fs.writeFileSync('C:/Users/nicol/AppData/Local/Temp/claude/backup-ritiri-vuoti-' + Date.now() + '.json',
  JSON.stringify(daRiparare.map(({ c, nuovo }) => ({ id: c.id, code: c.code, prima: c.pickupAddress, dopo: nuovo })), null, 1));
for (const { c, nuovo, fonte } of daRiparare) {
  await prisma.delivery.update({ where: { id: c.id }, data: { pickupAddress: nuovo,
    logs: { create: [{ type: 'legacy_update', message: `Indirizzo di ritiro vuoto valorizzato con ${fonte}: «${nuovo}» (bonifica 03/09 su ordine utente).` }] } } });
}
console.log(`\nFATTO: ${daRiparare.length} ritiri valorizzati (backup salvato).`);
await prisma.$disconnect();

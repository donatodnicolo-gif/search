/**
 * CORREGGE le 4 vendite marcate IN CITTÀ fra comuni DIVERSI (02/09, «verifica
 * se ci sono altri casi e correggi» dopo il caso #100845): #100099 (Milano →
 * Cesano Maderno), #100554 (Milano → Bonate Sotto), #100780 (Sesto San
 * Giovanni → Milano), #100781 (Genova → Portofino). Tutte senza distanza
 * misurata: si misura la strada vera (Directions) e si scrive
 * extraOutOfCity=true — sulla vendita la quota non usa i km, ma la paga del
 * valet sì (fuori città = tutti i km × tariffa della sua scheda).
 * Prova a vuoto di default; con --applica scrive (log su ogni consegna).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();
const chiave = (await prisma.appSetting.findUnique({ where: { key: 'googleMapsApiKey' } }))?.value?.trim();
if (!chiave) { console.log('googleMapsApiKey assente: non posso misurare.'); process.exit(1); }

for (const code of [100099, 100554, 100780, 100781]) {
  const d = await prisma.delivery.findFirst({ where: { code },
    select: { id: true, status: true, extraOutOfCity: true, distanceKm: true, invoiced: true,
      pickupAddress: true, recipientAddress: true,
      invoiceLines: { select: { id: true } }, salaryLines: { select: { id: true } } } });
  if (!d) { console.log(`#${code}: NON TROVATA`); continue; }
  if (d.extraOutOfCity) { console.log(`#${code}: già fuori città, salto`); continue; }
  if (d.invoiced || d.invoiceLines.length || d.salaryLines.length) { console.log(`#${code}: fatturata/in stipendio, NON toccata`); continue; }
  let km = d.distanceKm;
  if (km == null && d.pickupAddress && d.recipientAddress) {
    const url = 'https://maps.googleapis.com/maps/api/directions/json?origin='
      + encodeURIComponent(d.pickupAddress) + '&destination=' + encodeURIComponent(d.recipientAddress)
      + '&region=it&key=' + encodeURIComponent(chiave);
    try {
      const r = await (await fetch(url)).json();
      const metri = r.routes?.[0]?.legs?.[0]?.distance?.value;
      if (r.status === 'OK' && metri) km = Math.round((metri / 1000) * 10) / 10;
      else console.log(`  #${code}: Directions ${r.status} — distanza non misurabile`);
    } catch (e) { console.log(`  #${code}: errore Directions ${e.message.slice(0, 40)}`); }
  }
  console.log(`#${code} [${d.status}]: in città → FUORI CITTÀ · km ${d.distanceKm ?? '—'} → ${km ?? '—'}`);
  if (!APPLICA) continue;
  await prisma.delivery.update({ where: { id: d.id }, data: {
    extraOutOfCity: true,
    ...(km != null ? { distanceKm: km, extraKm: km } : {}),
    logs: { create: [{ type: 'price_fix', message: `Fuori città corretto: ritiro e consegna sono in comuni DIVERSI (il testo dell'indirizzo ingannava il confronto). ${km != null ? `Distanza misurata: ${km} km. ` : ''}Sulla vendita la quota non usa i km; la paga del valet segue la tariffa fuori città. Verifica dopo il caso #100845 (utente, 02/09).` }] },
  } });
  console.log('  ✅ corretta');
}
await prisma.$disconnect();

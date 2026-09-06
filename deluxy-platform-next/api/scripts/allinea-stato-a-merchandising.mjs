/**
 * ALLINEA LO STATO DEI PRODOTTI VERSO MERCHANDISING (06/09/2026 sera, regola utente).
 *
 * Merchandising tiene il campo `statoPiattaforma` (attivo | archiviato) per sapere che fine ha fatto
 * un prodotto nella piattaforma consegne. Dopo gli archivi del 06/09 (381 copie per provincia,
 * 1.274 mai consegnati nel 2026) quel campo è indietro: qui glielo si aggiorna.
 *
 * ⚠️ È un'informazione, non un ordine: Merchandising scrive solo `statoPiattaforma`, non tocca la
 * `fase` dei suoi prodotti (lo dice il commento della sua rotta). Si manda a lotti da 1000, la
 * chiave è quella già configurata (`merchandisingUrl` / `merchandisingApiKey` in AppSetting).
 * PROVA di default; `--scrivi` invia davvero.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const SCRIVI = process.argv.includes('--scrivi');
const p = new PrismaClient();

const cfg = Object.fromEntries((await p.appSetting.findMany({ where: { key: { in: ['merchandisingUrl', 'merchandisingApiKey'] } } })).map((r) => [r.key, r.value]));
const url = (cfg.merchandisingUrl ?? process.env.MERCHANDISING_URL ?? '').replace(/\/+$/, '');
const chiave = cfg.merchandisingApiKey ?? process.env.MERCHANDISING_API_KEY ?? '';
if (!url || !chiave) { console.error('Merchandising non configurato (merchandisingUrl / merchandisingApiKey).'); process.exit(1); }

// Solo i prodotti con SKU: Merchandising li riconosce dal `codice`.
const prodotti = await p.product.findMany({
  where: { deletedAt: null, sku: { not: null } },
  select: { sku: true, archived: true, active: true },
});
const stati = prodotti.map((x) => ({ codice: x.sku, stato: x.archived ? 'archiviato' : 'attivo' }));
const archiviati = stati.filter((x) => x.stato === 'archiviato').length;
console.log(`prodotti con SKU: ${stati.length} · archiviati: ${archiviati} · attivi: ${stati.length - archiviati}`);
if (!SCRIVI) { console.log('PROVA: nulla inviato. `--scrivi` per allineare.'); await p.$disconnect(); process.exit(0); }

let inviati = 0, errori = 0;
for (let i = 0; i < stati.length; i += 1000) {
  const lotto = stati.slice(i, i + 1000);
  const res = await fetch(`${url}/api/v1/prodotti/stato-piattaforma`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': chiave },
    body: JSON.stringify({ stati: lotto }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  const testo = await res.text().catch(() => '');
  if (res.ok) { inviati += lotto.length; console.log(`  lotto ${i / 1000 + 1}: ${lotto.length} · ${testo.slice(0, 120)}`); }
  else { errori++; console.log(`  ⚠️ lotto ${i / 1000 + 1}: HTTP ${res.status} ${testo.slice(0, 200)}`); }
}
console.log(`INVIATI: ${inviati} stati · lotti in errore: ${errori}`);
await p.$disconnect();

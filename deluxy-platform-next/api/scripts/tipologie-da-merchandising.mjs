/**
 * TIPOLOGIA DI VENDITA: SPECCHIO DA MERCHANDISING (10/09/2026, segnalazione utente sull'ordine 2902:
 * «abbiamo cambiato la tipologia di prodotto, aggiorna i bottoni legati alla vendita»).
 *
 *   node api/scripts/tipologie-da-merchandising.mjs            (anteprima)
 *   node api/scripts/tipologie-da-merchandising.mjs --applica
 *
 * Stessa regola di MerchandisingSyncService.allineaTipologie: per CODICE (sku = codice), si copia
 * `tipologiaVendita` di Merchandising dove è diversa; un valore vuoto di là non cancella quello di qua.
 * Dal 10/09 lo fa anche il cron ogni ora (/cron/tipologie); questo script serve a farlo subito.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const APPLICA = process.argv.includes('--applica');
const M = 'C:/Users/nicol/scoutwt/deluxy-merchandising/'; const P = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';
const rm = createRequire(M + 'package.json'); const rp = createRequire(P + 'api/package.json');
const env = (f) => { const l = fs.readFileSync(f, 'utf8').split(/\r?\n/).find((x) => x.startsWith('DATABASE_URL=')); const u = new URL(l.slice(13).trim().replace(/^"|"$/g, '')); u.searchParams.set('connection_limit', '1'); return u; };
const um = env(M + '.env'); const up = env(P + 'api/.env'); up.searchParams.set('schema', 'platform');
const dm = new (rm('@prisma/client').PrismaClient)({ datasources: { db: { url: um.toString() } } });
const dp = new (rp('@prisma/client').PrismaClient)({ datasources: { db: { url: up.toString() } } });
const merch = await dm.prodotto.findMany({ where: { NOT: { tipologiaVendita: null } }, select: { codice: true, tipologiaVendita: true } });
const daLoro = new Map(merch.map((m) => [String(m.codice ?? '').trim().toUpperCase(), m.tipologiaVendita]));
const nostri = await dp.product.findMany({ where: { deletedAt: null, NOT: { sku: null }, prodottoApp: false }, select: { id: true, sku: true, name: true, tipologiaVendita: true } });
const daCambiare = nostri.filter((p) => { const t = daLoro.get(p.sku.trim().toUpperCase()); return t && t !== p.tipologiaVendita; });
console.log(`prodotti con tipologia in Merchandising: ${merch.length} · nostri con codice: ${nostri.length} · da cambiare: ${daCambiare.length}`);
for (const p of daCambiare.slice(0, 40)) console.log(`  ${p.sku}  ${p.name}: ${p.tipologiaVendita ?? '—'} → ${daLoro.get(p.sku.trim().toUpperCase())}`);
if (!APPLICA) { console.log('ANTEPRIMA: nessuna scrittura.'); await dm.$disconnect(); await dp.$disconnect(); process.exit(0); }
for (const p of daCambiare) await dp.product.update({ where: { id: p.id }, data: { tipologiaVendita: daLoro.get(p.sku.trim().toUpperCase()) } });
console.log(`FATTO: ${daCambiare.length} tipologie scritte.`);
await dm.$disconnect(); await dp.$disconnect();

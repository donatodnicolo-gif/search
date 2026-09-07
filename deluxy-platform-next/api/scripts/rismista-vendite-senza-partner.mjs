/**
 * RISMISTA LE VENDITE RIMASTE SENZA PARTNER (05/09/2026, regola utente).
 *
 * Lo smistamento gira una volta sola, alla nascita della vendita: le vendite
 * uscite senza partner per la vecchia regola degli orari (si confrontava l'ora
 * di ARRIVO invece della FASCIA DI CONSEGNA) restavano ferme per sempre.
 *
 * ⚠️ Usa il CODICE VERO (`SalesService.rismistaAperte`), non una copia della
 * regola: il servizio dipende solo da PrismaService, quindi si costruisce a
 * mano senza tirare su tutto Nest. Prima serve `npx nest build`.
 *
 * Uso:  node scripts/rismista-vendite-senza-partner.mjs            (solo elenco)
 *       node scripts/rismista-vendite-senza-partner.mjs --applica  (scrive)
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();

const { PrismaService } = require('../dist/prisma/prisma.service');
const { SalesService } = require('../dist/sales/sales.module');

const prisma = new PrismaService();
const sales = new SalesService(prisma);
const applica = process.argv.includes('--applica');

const r = await sales.rismistaAperte(applica);
console.log(`guardate: ${r.guardate} · con un partner: ${r.proposte} · ancora ferme: ${r.ferme}${applica ? ' · SCRITTE' : ' (prova)'}\n`);
const w = (t, n) => String(t ?? '—').padEnd(n).slice(0, n);
console.log(w('ordine', 8), w('brand', 14), w('prov', 5), w('data', 11), w('prodotto', 30), w('esito', 40));
console.log('-'.repeat(112));
for (const x of r.righe) {
  console.log(w(x.ordine, 8), w(x.brand, 14), w(x.provincia, 5), w(x.data, 11), w(x.prodotto, 30),
    w(x.partner ? `→ ${x.partner} (${x.motivo})` : `ferma: ${x.saltata}`, 40));
}
if (!applica) console.log('\n(prova: nessuna scrittura. Rilancia con --applica)');
await prisma.$disconnect();

/**
 * I FIORI A STELO SONO PRODOTTI A NUMERO (07/09/2026, regola utente: «rose rosse 9 è un prodotto
 * a numero, è il controllo che il Customer Service dovrebbe fare a monte»).
 *
 * Erano classificati `unico` perché sono prodotti UNICI del partner (il controllo sul tipo veniva
 * prima, nello script del 06/09). Ma «unico» dice CHI lo vende, non COME si vende: il prezzo di
 * uno stelo si moltiplica per gli steli, ed è esattamente la definizione di «a quantità». Senza
 * questa correzione il listino del fioraio non arriva nelle liste di prodotto del Customer
 * Service, che importa solo `quantita` e `preventivo`.
 * PROVA di default; `--scrivi` per scrivere.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/api/package.json');
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const SCRIVI = process.argv.includes('--scrivi');
const p = new PrismaClient();

const cat = await p.category.findFirst({ where: { name: 'Fiori a stelo' }, select: { id: true } });
const steli = await p.product.findMany({
  where: { deletedAt: null, OR: [{ categoryId: cat?.id ?? '-' }, { sku: { startsWith: 'STELO-' } }] },
  select: { id: true, name: true, sku: true, price: true, tipologiaVendita: true, partner: { select: { insegna: true } } },
});
const daCambiare = steli.filter((x) => x.tipologiaVendita !== 'quantita');
console.table([
  { voce: 'prodotti «Fiori a stelo» (o sku STELO-*)', n: steli.length },
  { voce: 'già a quantità', n: steli.length - daCambiare.length },
  { voce: 'DA CAMBIARE in «a quantità»', n: daCambiare.length },
]);
console.log('esempi:', daCambiare.slice(0, 5).map((x) => `${x.partner?.insegna ?? '—'} · ${x.name} ${x.price} €`).join(' · '));
if (SCRIVI) {
  let n = 0;
  for (let i = 0; i < daCambiare.length; i += 200) {
    const r = await p.product.updateMany({ where: { id: { in: daCambiare.slice(i, i + 200).map((x) => x.id) } }, data: { tipologiaVendita: 'quantita' } });
    n += r.count;
  }
  const perTip = await p.product.groupBy({ by: ['tipologiaVendita'], where: { deletedAt: null, archived: false }, _count: { _all: true } });
  console.log(`SCRITTI: ${n}`);
  console.log('catalogo per tipologia:', perTip.map((x) => `${x.tipologiaVendita ?? 'non classificati'}=${x._count._all}`).join(' · '));
} else console.log('PROVA: nulla scritto. `--scrivi` per applicare.');
await p.$disconnect();

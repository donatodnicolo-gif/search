/**
 * CHANEL NON SI TOCCA (07/09/2026, regola utente: «tutti quelli che sono abbinati a Chanel non
 * vanno toccati»), e SUSHI FLOREALE va fra i fiori, in archivio.
 *
 * Due cose:
 *  1. RIMETTE A CATALOGO i 12 prodotti dei partner Chanel archiviati il 06/09 dalla pulizia
 *     «mai consegnati nel 2026» (WFJ, Handbags, SLG, Misc. Acc., RTW, Flowers…). Sono le voci
 *     con cui Chanel inserisce le sue consegne: senza, il loro modulo resta senza prodotti.
 *     ⚠️ NON tocca i 28 archiviati il 24/08 con motivo «nessuna-consegna-dal-2025-01-01»:
 *     quella è una decisione più vecchia di questa sessione, e disfarla sarebbe toccarli
 *     nell'altro verso. Se li si rivuole, si tolgono dall'archivio dalla scheda prodotto.
 *  2. «Sushi Floreale - Medio €70» prende la categoria FIORI e va in archivio: è uno dei tre
 *     rimasti senza famiglia quando si sono creati i generici.
 *
 * PROVA di default; `--scrivi` esegue.
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

const chanel = await p.partner.findMany({ where: { insegna: { contains: 'chanel', mode: 'insensitive' } }, select: { id: true, insegna: true } });
const daRimettere = await p.product.findMany({
  where: {
    partnerId: { in: chanel.map((x) => x.id) },
    deletedAt: null,
    archived: true,
    archivedReason: null,
    archivedAt: { gte: new Date('2026-09-06T00:00:00Z') },
  },
  select: { id: true, name: true, partner: { select: { insegna: true } }, archivedAt: true },
});
console.log(`prodotti Chanel archiviati dalla pulizia del 06/09: ${daRimettere.length}`);
for (const x of daRimettere) console.log(`  · ${x.partner?.insegna}: ${x.name}`);

const sushi = await p.product.findMany({ // solo quelli ancora A CATALOGO: gli altri sono già in archivio e cambiargli la categoria
  // adesso non servirebbe a niente (e sarebbe toccare la storia per un dettaglio).
  where: { name: { contains: 'sushi floreale', mode: 'insensitive' }, deletedAt: null, archived: false }, select: { id: true, name: true, archived: true, category: { select: { name: true } } } });
const fiori = await p.category.findFirst({ where: { name: 'Fiori' }, select: { id: true, name: true } });
console.log(`\nSushi Floreale: ${sushi.length} righe · categoria oggi: ${sushi.map((x) => x.category?.name ?? '(nessuna)').join(', ')} → «${fiori?.name}» e in archivio`);

if (SCRIVI) {
  const r = await p.product.updateMany({ where: { id: { in: daRimettere.map((x) => x.id) } }, data: { archived: false, archivedAt: null } });
  console.log(`\nRIMESSI A CATALOGO: ${r.count}`);
  if (fiori) {
    const s = await p.product.updateMany({
      where: { id: { in: sushi.map((x) => x.id) } },
      data: { categoryId: fiori.id, archived: true, archivedAt: new Date(), archivedReason: 'fiori-archiviato-2026-09-07' },
    });
    console.log(`SUSHI FLOREALE: ${s.count} righe messe in «Fiori» e archiviate`);
  }
  const restano = await p.product.count({ where: { deletedAt: null, archived: false } });
  console.log('prodotti non archiviati a catalogo:', restano);
} else console.log('\nPROVA: nulla scritto. `--scrivi` per applicare.');
await p.$disconnect();

/**
 * LE 6 VENDITE DI AGOSTO CONSEGNATE DA SAMI TORNANO «DA PAGARE» (10/09/2026, decisione utente:
 * «le 7, quelle consegnate vanno pagate»).
 *
 *   node api/scripts/rimetti-da-pagare-sette-agosto.mjs            (anteprima)
 *   node api/scripts/rimetti-da-pagare-sette-agosto.mjs --applica
 *
 * Erano importate dal vecchio gestionale con payable=false SENZA nessuna regola collegata
 * (#62414, #62415, #62822, #62974, #62975, #63028). La #62748 e' annullata: resta fuori.
 * Scrive solo `payable = true` + una riga di registro; non tocca paga, km, stato.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const APPLICA = process.argv.includes('--applica');
const RADICE = 'C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/';
const require = createRequire(RADICE + 'api/package.json');
const { PrismaClient } = require('@prisma/client');
const rigaEnv = fs.readFileSync(RADICE + 'api/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(rigaEnv.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); u.searchParams.set('connection_limit', '1');
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });
const CODICI = [62414, 62415, 62822, 62974, 62975, 63028];
const rows = await db.delivery.findMany({ where: { code: { in: CODICI } }, select: { id: true, code: true, status: true, payable: true, valetSalary: true, deliveryRuleId: true, partner: { select: { insegna: true } } } });
for (const r of rows) console.log(`#${r.code} ${r.partner.insegna} ${r.status} payable=${r.payable} paga=${r.valetSalary} regola=${r.deliveryRuleId ?? '—'}`);
const daFare = rows.filter((r) => r.status === 'delivered' && !r.payable && !r.deliveryRuleId);
console.log(`da rimettere «da pagare»: ${daFare.length}`);
if (!APPLICA) { console.log('ANTEPRIMA: nessuna scrittura.'); await db.$disconnect(); process.exit(0); }
for (const r of daFare) {
  await db.$transaction([
    db.delivery.update({ where: { id: r.id }, data: { payable: true } }),
    db.deliveryLog.create({ data: { deliveryId: r.id, type: 'note', message: 'Rimessa «da pagare» il 10/09/2026 (decisione utente): era importata dal vecchio gestionale come non pagabile senza nessuna regola collegata; consegnata da Sami Chakroun.' } }),
  ]);
  console.log(`  OK #${r.code}`);
}
const dopo = await db.delivery.findMany({ where: { code: { in: CODICI } }, select: { code: true, payable: true } });
console.log('VERIFICA:', dopo.map((d) => `#${d.code} payable=${d.payable}`).join(', '));
await db.$disconnect();

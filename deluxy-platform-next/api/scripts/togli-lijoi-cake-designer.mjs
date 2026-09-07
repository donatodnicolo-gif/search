/** Toglie a LIJOI il mestiere «Cake designer» (regola utente 07/09/2026) e lo leva dalle liste di
 *  priorità di quel mestiere, rinumerando le posizioni: una lista non si ripulisce da sola, e
 *  restare in lista significa continuare a ricevere proposte. PROVA di default; --scrivi applica. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/nicol/app/.claude/worktrees/deploy-delivery/deluxy-platform-next/api/package.json');
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform'); process.env.DATABASE_URL = u.toString();
const SCRIVI = process.argv.includes('--scrivi');
const p = new PrismaClient();

const partner = await p.partner.findMany({ where: { insegna: { contains: 'lijoi', mode: 'insensitive' } }, select: { id: true, insegna: true, deleted: true, active: true, mestieri: { select: { mestiereId: true, mestiere: { select: { nome: true } } } } } });
console.log('partner trovati:', partner.map((x) => `${x.insegna} (${x.active ? 'attivo' : 'spento'}${x.deleted ? ', cancellato' : ''}) → mestieri: ${x.mestieri.map((m) => m.mestiere.nome).join(', ') || 'nessuno'}`).join(' · '));
const cd = await p.mestiere.findFirst({ where: { nome: 'Cake designer' }, select: { id: true } });
for (const x of partner) {
  const ha = x.mestieri.some((m) => m.mestiereId === cd.id);
  if (!ha) { console.log(`  ${x.insegna}: non ha il mestiere Cake designer, niente da fare`); continue; }
  const liste = await p.priorityList.findMany({ where: { mestiereId: cd.id, entries: { some: { partnerId: x.id } } }, include: { entries: { orderBy: { position: 'asc' } }, province: { select: { code: true } } } });
  console.log(`  ${x.insegna}: presente in ${liste.length} liste di priorità Cake designer (${liste.map((l) => l.province?.code ?? '?').join(', ')})`);
  if (!SCRIVI) continue;
  await p.partnerMestiere.deleteMany({ where: { partnerId: x.id, mestiereId: cd.id } });
  for (const l of liste) {
    const restano = l.entries.filter((e) => e.partnerId !== x.id);
    await p.priorityEntry.deleteMany({ where: { listId: l.id, partnerId: x.id } });
    let i = 1;
    for (const e of restano) { if (e.position !== i) await p.priorityEntry.update({ where: { id: e.id }, data: { position: i } }); i++; }
    console.log(`    lista ${l.province?.code}: tolto, restano ${restano.length} partner rinumerati`);
  }
  console.log(`  ✓ ${x.insegna}: mestiere Cake designer tolto`);
}
if (!SCRIVI) console.log('PROVA: nulla scritto. `--scrivi` per applicare.');
await p.$disconnect();

/**
 * TRE CHIUSURE DECISE DALL'UTENTE IL 10/09/2026:
 *  1. tutte le consegne in «cancellazione richiesta» → Storico come ANNULLATE;
 *  2. Chanel Milano Rinascente: le 2 legacy del 04/12/2024 (#27364, #27365) → Storico come annullate
 *     (mai lavorate qui; annullate e non consegnate per non farle entrare in fatturazione);
 *  3. #63113 e #100876 (Chanel Milano Sant'Andrea) → CONSEGNATE, con deliveredAt alla fine della fascia.
 *
 *   node api/scripts/chiusure-chanel-10-09.mjs            (anteprima)
 *   node api/scripts/chiusure-chanel-10-09.mjs --applica
 * Riga di registro su ogni consegna; attività chiuse come fa l'app (chiudiAttivitaSeStorico).
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
const sel = { id: true, code: true, date: true, status: true, deliveryTimeTo: true, deliveredAt: true, partner: { select: { insegna: true } } };
const cancReq = await db.delivery.findMany({ where: { deletedAt: null, status: 'cancellation_requested' }, select: sel, orderBy: { code: 'asc' } });
const rinascente = await db.delivery.findMany({ where: { deletedAt: null, code: { in: [27364, 27365] } }, select: sel });
const consegnate = await db.delivery.findMany({ where: { deletedAt: null, code: { in: [63113, 100876] } }, select: sel });
const stampa = (t, rows) => { console.log(`\n${t}: ${rows.length}`); for (const r of rows) console.log(`  #${r.code} ${r.partner.insegna} ${r.date.toISOString().slice(0, 10)} ${r.status}`); };
stampa('1) cancellazione richiesta → annullata', cancReq);
stampa('2) Rinascente legacy → annullata', rinascente.filter((r) => r.status !== 'cancelled'));
stampa('3) → consegnata', consegnate.filter((r) => r.status !== 'delivered'));
if (!APPLICA) { console.log('\nANTEPRIMA: nessuna scrittura.'); await db.$disconnect(); process.exit(0); }
const oggi = '10/09/2026';
async function annulla(r, motivo) {
  await db.$transaction([
    db.delivery.update({ where: { id: r.id }, data: { status: 'cancelled' } }),
    db.activity.updateMany({ where: { deliveryId: r.id, status: 'pending' }, data: { status: 'skipped' } }),
    db.deliveryLog.create({ data: { deliveryId: r.id, type: 'status_change', message: `Annullata d'ufficio il ${oggi} (decisione utente): ${motivo}; era «${r.status}».` } }),
  ]);
  console.log(`  annullata #${r.code}`);
}
for (const r of cancReq) await annulla(r, 'cancellazione richiesta mai decisa, portata in storico');
for (const r of rinascente.filter((x) => x.status !== 'cancelled')) await annulla(r, 'consegna del 04/12/2024 importata dal vecchio gestionale e mai lavorata');
for (const r of consegnate.filter((x) => x.status !== 'delivered')) {
  const [h, m] = (r.deliveryTimeTo ?? '18:00').split(':').map(Number);
  const giorno = r.date.toISOString().slice(0, 10);
  // fine fascia, ora di Roma (settembre/agosto = UTC+2)
  const deliveredAt = new Date(`${giorno}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+02:00`);
  await db.$transaction([
    db.delivery.update({ where: { id: r.id }, data: { status: 'delivered', deliveredAt } }),
    db.activity.updateMany({ where: { deliveryId: r.id, status: { not: 'done' } }, data: { status: 'done' } }),
    db.deliveryLog.create({ data: { deliveryId: r.id, type: 'delivered', message: `Segnata consegnata d'ufficio il ${oggi} (decisione utente); era «${r.status}»; ora di consegna messa alla fine della fascia (${giorno} ${r.deliveryTimeTo ?? '18:00'}).` } }),
  ]);
  console.log(`  consegnata #${r.code} (${deliveredAt.toISOString()})`);
}
const dopo = await db.delivery.findMany({ where: { code: { in: [...cancReq.map((r) => r.code), 27364, 27365, 63113, 100876] } }, select: { code: true, status: true } });
console.log('VERIFICA:', dopo.map((d) => `#${d.code}=${d.status}`).join(', '));
console.log('ancora in cancellazione richiesta:', await db.delivery.count({ where: { deletedAt: null, status: 'cancellation_requested' } }));
await db.$disconnect();

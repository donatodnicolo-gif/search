// ============================================================
// #62976 — la paga del valet, dal listino urbano
// ------------------------------------------------------------
// Deciso dall'utente il 25/08/2026: «per la 62976 devi calcolare contando che
// il ritiro è stato nella stessa città e applicare il listino urbano per il
// valet», e «i 15 € erano un esempio, devi guardare la paga in database
// assegnata al valet».
//
// Ritiro e consegna sono entrambi a Roma (il ritiro l'abbiamo corretto poco
// prima: era la stringa «Milano», da cui 579,63 km e 579,63 € di paga). Quindi
// NON si applica il listino fuori citta': si applica quello urbano del valet.
//
//   Sami Nicolas Chakroun, «Consegna Standard»: 12,50 € + 0,70 €/km, 0 inclusi
//   1,40 km  →  12,50 + 0,70 × 1,40  =  13,48 €
//
// ⚠️ E NON si applica la regola carnet. Le altre due consegne della vendita
// (#62974 e #62975) hanno `payable = false`: non sono pagate. Questa e' quella
// che porta la paga del giro, quindi prende la tariffa piena — non il plus.
// Nel legacy la vendita ha `expertRuleId 4`, cioe' «Regola valet 4» (piu' di un
// ritiro → +0): la regola c'e' gia', ed e' stata applicata azzerando le altre.
//
// PROVA A VUOTO DI DEFAULT. Si applica con --scrivi.
// ============================================================
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const SCRIVI = process.argv.includes('--scrivi');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;
const db = new PrismaClient();
const r2 = (x) => Math.round(x * 100) / 100;
const eu = (n) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

try {
  const d = await db.delivery.findFirst({
    where: { code: 62976 },
    select: { id: true, code: true, distanceKm: true, valetSalary: true, valetAdditionalPrice: true,
      pickupAddress: true, recipientAddress: true, valetServiceId: true, legacyOrderId: true,
      valet: { select: { firstName: true, lastName: true, minimumKmIncluded: true } } },
  });
  if (!d) { console.error('#62976 non trovata.'); process.exit(1); }
  if (!d.valetServiceId) { console.error('nessun listino collegato: non tocco niente.'); process.exit(1); }

  const t = await db.valetService.findUnique({ where: { id: d.valetServiceId },
    select: { salary: true, extraKmPrice: true, serviceType: { select: { name: true } } } });
  if (t?.salary == null) { console.error('listino senza tariffa: non tocco niente.'); process.exit(1); }

  const inclusi = d.valet?.minimumKmIncluded ?? 0;
  const km = d.distanceKm ?? 0;
  const paga = r2(t.salary + (t.extraKmPrice ?? 0) * Math.max(0, km - inclusi));

  // controprova: le sorelle non sono pagate, quindi questa porta la paga piena
  const sorelle = await db.delivery.findMany({
    where: { deletedAt: null, legacyOrderId: d.legacyOrderId, code: { not: 62976 } },
    select: { code: true, payable: true, valetSalary: true } });
  const qualcunaPagata = sorelle.some((s) => s.payable && ((s.valetSalary ?? 0) > 0));

  console.log(`#62976 — ${d.valet?.firstName} ${d.valet?.lastName}`);
  console.log(`  ritiro ${JSON.stringify(d.pickupAddress)} → consegna ${d.recipientAddress}`);
  console.log(`  stessa citta: si → listino URBANO, non quello fuori citta`);
  console.log(`  «${t.serviceType?.name}»: ${eu(t.salary)} + ${t.extraKmPrice} €/km oltre ${inclusi} · ${km} km`);
  console.log(`  paga ${eu(r2((d.valetSalary ?? 0) + (d.valetAdditionalPrice ?? 0)))} → ${eu(paga)}`);
  console.log(`  altre consegne della vendita: ${sorelle.map((s) => `#${s.code} payable ${s.payable ? 'si' : 'NO'}`).join(' · ')}`);
  console.log(`  qualcuna gia' pagata? ${qualcunaPagata ? 'SI → andrebbe il plus di carnet' : 'no → questa porta la paga piena'}`);
  if (qualcunaPagata) { console.error('\n⚠️ una sorella risulta pagata: mi fermo, il caso non e\' piu\' quello descritto.'); process.exit(1); }

  if (!SCRIVI) { console.log('\nPROVA A VUOTO — non ho scritto niente. Rilancia con --scrivi.'); process.exit(0); }

  fs.writeFileSync('scripts/backup-paga-62976.json', JSON.stringify(
    { id: d.id, code: d.code, valetSalary: d.valetSalary, valetAdditionalPrice: d.valetAdditionalPrice }, null, 1));
  await db.$transaction([
    db.delivery.update({ where: { id: d.id }, data: { valetSalary: paga } }),
    db.deliveryLog.create({ data: { deliveryId: d.id, type: 'paga-ricalcolata',
      message: `Paga ${eu(d.valetSalary ?? 0)} → ${eu(paga)}. Ritiro e consegna sono nella STESSA città (Roma), quindi vale il listino URBANO del valet `
        + `«${t.serviceType?.name}»: ${t.salary} € + ${t.extraKmPrice} €/km oltre ${inclusi} km, su ${km} km. `
        + `Non si applica il plus di carnet: le altre due consegne della vendita hanno payable = false, quindi è questa a portare la paga del giro. `
        + `La paga di prima nasceva dalla distanza sbagliata (579,63 km dal ritiro «Milano»).` } }),
  ]);
  console.log('\nfatto, con la riga nel registro. Backup in scripts/backup-paga-62976.json');
} finally {
  await db.$disconnect();
}

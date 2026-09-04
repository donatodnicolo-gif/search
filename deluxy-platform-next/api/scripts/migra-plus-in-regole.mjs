/**
 * MIGRAZIONE «REGOLE» (regola utente 04/09/2026): il valore della regola carnet
 * esce dal plus/minus e va nel campo nuovo `Delivery.ruleAdjustment`; il
 * plus/minus resta SOLO per le variazioni manuali.
 *
 * Passi:
 *  1. ALTER TABLE additivo (idempotente): platform."Delivery"."ruleAdjustment".
 *  2. Per ogni consegna con regola carnet (deliveryRuleId), con A = aggiustamento
 *     della regola e P = plus/minus scritto:
 *       - P == A  (copia del legacy)  → ruleAdjustment = A, plus = null
 *       - P == 0 / null               → ruleAdjustment = A, plus invariato
 *       - P != A (54 casi)            → ruleAdjustment = A, plus = P − A
 *         (il totale fatturabile resta P, com'era scritto: la fotografia vince;
 *          i casi vengono elencati per una verifica a mano)
 *     Backup JSON di ogni riga toccata + una riga nel registro della consegna.
 *
 * Anteprima di default; scrive con --applica. Idempotente: una consegna con
 * ruleAdjustment già valorizzato non si tocca.
 * Uso: node scripts/migra-plus-in-regole.mjs [--applica] [--solo-alter]
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();
const APPLICA = process.argv.includes('--applica');
const SOLO_ALTER = process.argv.includes('--solo-alter');
const q2 = (n) => Math.round(n * 100) / 100;

// 1. La colonna (additiva, idempotente).
if (APPLICA || SOLO_ALTER) {
  await prisma.$executeRawUnsafe(`ALTER TABLE platform."Delivery" ADD COLUMN IF NOT EXISTS "ruleAdjustment" DOUBLE PRECISION`);
  console.log('✓ colonna platform."Delivery"."ruleAdjustment" presente');
  if (SOLO_ALTER) { await prisma.$disconnect(); process.exit(0); }
} else {
  console.log('(anteprima: la colonna si crea con --applica o --solo-alter)');
}

// 2. Le consegne con regola. Si legge via SQL così l'anteprima funziona anche
//    prima che la colonna esista (il client Prisma la vorrebbe già).
const rows = await prisma.$queryRawUnsafe(`
  SELECT d.id, d.code, d.date, d."additionalPrice" AS plus, d."deliveryRuleId",
         r.name AS regola, r."partnerBillingAdjustment" AS adj,
         ${APPLICA ? 'd."ruleAdjustment"' : 'NULL'} AS gia
  FROM platform."Delivery" d
  JOIN platform."DeliveryRule" r ON r.id = d."deliveryRuleId"
  WHERE d."deletedAt" IS NULL AND d."deliveryRuleId" IS NOT NULL
  ORDER BY d.date, d.code`);
const piano = { copia: [], soloRegola: [], diverso: [], giaFatte: 0 };
for (const r of rows) {
  if (r.gia != null) { piano.giaFatte++; continue; }
  const P = Number(r.plus ?? 0), A = Number(r.adj ?? 0);
  if (P !== 0 && Math.abs(P - A) < 0.005) piano.copia.push({ ...r, nuovoPlus: null });
  else if (P === 0) piano.soloRegola.push({ ...r, nuovoPlus: r.plus });
  else piano.diverso.push({ ...r, nuovoPlus: q2(P - A) });
}
console.log(`\nconsegne con regola: ${rows.length} — già migrate: ${piano.giaFatte}`);
console.log(`- plus == regola (copia): ${piano.copia.length} → Regole = A, plus svuotato`);
console.log(`- plus vuoto: ${piano.soloRegola.length} → Regole = A`);
console.log(`- plus diverso: ${piano.diverso.length} → Regole = A, plus manuale = P − A (totale invariato):`);
for (const r of piano.diverso) console.log(`    #${r.code} ${new Date(r.date).toISOString().slice(0, 10)} «${r.regola}» A=${r.adj} P=${r.plus} → plus manuale ${r.nuovoPlus}`);

if (!APPLICA) { console.log('\n(anteprima: niente scritto — usa --applica)'); await prisma.$disconnect(); process.exit(0); }

const tutte = [...piano.copia, ...piano.soloRegola, ...piano.diverso];
const backup = tutte.map((r) => ({ id: r.id, code: r.code, additionalPrice: r.plus, deliveryRuleId: r.deliveryRuleId }));
const nomeBackup = `scripts/backup-plus-in-regole-${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(nomeBackup, JSON.stringify(backup, null, 1));
console.log(`\nbackup: ${nomeBackup} (${backup.length} righe)`);

let fatte = 0;
for (let i = 0; i < tutte.length; i += 200) {
  const lotto = tutte.slice(i, i + 200);
  await prisma.$transaction(lotto.flatMap((r) => [
    prisma.delivery.update({ where: { id: r.id }, data: { ruleAdjustment: Number(r.adj ?? 0), additionalPrice: r.nuovoPlus == null ? null : Number(r.nuovoPlus) } }),
    prisma.deliveryLog.create({ data: { deliveryId: r.id, type: 'note',
      message: `Regole: ${Number(r.adj ?? 0)} € dalla «${r.regola}» (campo nuovo, 04/09/2026); plus/minus ${r.plus ?? 0} → ${r.nuovoPlus ?? 0}${r.nuovoPlus == null ? ' (era la copia della regola)' : (Number(r.plus ?? 0) === 0 ? '' : ' (resta la parte manuale)')}` } }),
  ]));
  fatte += lotto.length;
  console.log(`  ${fatte}/${tutte.length}`);
}
console.log('✓ migrazione applicata');
await prisma.$disconnect();

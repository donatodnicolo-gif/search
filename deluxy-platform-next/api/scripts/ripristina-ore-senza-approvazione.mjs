/**
 * CONSEGNE FINITE IN «ORE DA APPROVARE» SU SERVIZI CHE NON LO PREVEDONO
 * (05/09/2026, regola utente: «sono solo per i servizi orari con approvazione»).
 *
 * Dal 04/09 al 05/09 il flusso di approvazione valeva per TUTTI i servizi a
 * ore: le consegne dei servizi SENZA approvazione (Chanel a ora, Servizio a
 * Ora…) si sono fermate in `delivered_time_to_approve` aspettando un partner
 * che non doveva decidere niente. Qui passano a `delivered` — le ore che il
 * valet ha dichiarato restano scritte (`valetStartTime/EndTime`), prezzo e
 * paga non si toccano — con una riga di registro che dice perche'.
 *
 * Uso:  node scripts/ripristina-ore-senza-approvazione.mjs            (prova)
 *       node scripts/ripristina-ore-senza-approvazione.mjs --applica  (scrive)
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
const ferme = await prisma.$queryRawUnsafe(`
  SELECT d."id", d."code", d."valetStartTime", d."valetEndTime", s."name" AS servizio, s."hoursApproval", p."insegna"
  FROM platform."Delivery" d
  JOIN platform."ServiceType" s ON s."id" = d."serviceTypeId"
  LEFT JOIN platform."Partner" p ON p."id" = d."partnerId"
  WHERE d."status" = 'delivered_time_to_approve' AND d."deletedAt" IS NULL
  ORDER BY d."code"`);
const daChiudere = ferme.filter((f) => !f.hoursApproval);
console.log(`in «ore da approvare»: ${ferme.length} · su servizi SENZA approvazione (da chiudere): ${daChiudere.length}`);
for (const f of ferme) console.log(` #${f.code} · ${f.servizio} · ${f.insegna ?? '—'} · ore ${f.valetStartTime ?? '?'}–${f.valetEndTime ?? '?'} · ${f.hoursApproval ? 'RESTA (con approvazione)' : '→ consegnata'}`);
if (!APPLICA) { console.log('(prova: nessuna scrittura. Rilancia con --applica)'); await prisma.$disconnect(); process.exit(0); }
for (const f of daChiudere) {
  await prisma.$transaction([
    prisma.delivery.update({ where: { id: f.id }, data: { status: 'delivered', hoursDecision: null } }),
    prisma.deliveryLog.create({ data: { deliveryId: f.id, type: 'status_change',
      message: `Stato: delivered_time_to_approve -> delivered · il servizio «${f.servizio}» non prevede l'approvazione delle ore (regola utente 05/09): chiusa con le ore dichiarate ${f.valetStartTime ?? '?'}–${f.valetEndTime ?? '?'}` } }),
  ]);
}
console.log(`✓ chiuse ${daChiudere.length}`);
await prisma.$disconnect();

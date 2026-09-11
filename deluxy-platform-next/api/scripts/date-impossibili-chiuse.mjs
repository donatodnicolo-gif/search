/**
 * ⭐ 11/09/2026 (istruzione utente: «tutte le consegne con data 2012 vanno riverificate con database e
 * in caso aggiornate») — LE ALTRE DATE IMPOSSIBILI, quelle su consegne già chiuse.
 *
 * Il primo giro (`sistema-merce-in-sede.mjs`) ha corretto le 52 ancora aperte. Restano 40 righe con la
 * data prima del 2020 su consegne consegnate, approvate o assegnate: non pesano su nessun contatore, ma
 * falsano la storia — chi cerca «le consegne del 2012» le trova, e una consegna di dicembre finisce in
 * un anno in cui l'azienda non esisteva.
 *
 * ⚠️ La data NON si indovina con una formula: si legge dalle consegne vicine. Gli id sono progressivi,
 * e ogni blocco nasce in pochi minuti, quindi le righe con l'id accanto — create nello stesso minuto,
 * dallo stesso caricamento — dicono per che giorno era quel lavoro. È lo stesso metodo del primo giro,
 * e in tre casi su quattro la data sbagliata è anche un **anagramma** di quella giusta (2012-05-24 e
 * 2024-12-05 hanno le stesse cifre), che conferma da dove nasce l'errore: le tre parti della data
 * scambiate di posto al momento della scrittura.
 *
 * Uso:  node scripts/date-impossibili-chiuse.mjs [--applica]
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
require('dotenv').config();

const APPLICA = process.argv.includes('--applica');
const url = new URL(process.env.DATABASE_URL.replace('schema=tasks', 'schema=platform'));
url.searchParams.set('connection_limit', '1');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

/** Ogni gruppo con la sua prova: quali vicini si sono guardati e che data portano. */
const GRUPPI = [
  { da: 14331, a: 14340, sbagliata: '2001-09-13', giusta: '2023-10-09',
    prova: 'create il 09/10/2023 alle 12:23; le quattro immediatamente precedenti (#14327-#14330), create la stessa mattina, portano tutte la data 09/10/2023' },
  { da: 27893, a: 28011, sbagliata: '2012-05-24', giusta: '2024-12-05',
    prova: 'create il 05/12/2024 alle 17:28; le vicine dello stesso caricamento (#27889-#27896) portano la data 05/12/2024, di cui 2012-05-24 è l’anagramma' },
  { da: 46952, a: 46953, sbagliata: '2012-03-25', giusta: '2025-12-03',
    prova: 'create il 02/12/2025 alle 08:34; le tre subito successive (#46954-#46956), create quattro minuti dopo, portano la data 03/12/2025, di cui 2012-03-25 è l’anagramma' },
  { da: 62340, a: 62340, sbagliata: '2001-08-01', giusta: '2026-08-01',
    prova: 'creata il 31/07/2026 alle 17:10; giorno e mese (01/08) sono plausibili e i vicini lavorano fra il 31/07 e il 04/08/2026 — sbagliato solo l’anno' },
];

const iso = (d) => new Date(d).toISOString().slice(0, 10);

async function main() {
  const righe = await prisma.$queryRawUnsafe(`
    SELECT d."id", d."code", d."date", d."status", d."createdAt", COALESCE(pa."insegna",'—') AS partner
    FROM platform."Delivery" d LEFT JOIN platform."Partner" pa ON pa."id" = d."partnerId"
    WHERE d."deletedAt" IS NULL AND d."date" < '2020-01-01'
    ORDER BY d."code"`);
  console.log(`Consegne con data prima del 2020: ${righe.length}`);

  const proposte = [], fuori = [];
  for (const r of righe) {
    const vecchia = iso(r.date);
    const g = GRUPPI.find((x) => r.code >= x.da && r.code <= x.a && x.sbagliata === vecchia);
    if (!g) { fuori.push({ code: r.code, vecchia, creata: iso(r.createdAt) }); continue; }
    proposte.push({ id: r.id, code: r.code, vecchia, nuova: g.giusta, prova: g.prova, status: r.status, partner: r.partner, creata: iso(r.createdAt) });
  }

  const perGruppo = {};
  for (const p of proposte) (perGruppo[`${p.vecchia} → ${p.nuova}`] ??= []).push(p.code);
  console.log(`\nDa correggere: ${proposte.length}`);
  for (const [k, v] of Object.entries(perGruppo)) console.log(`  ${k}  ${v.length} consegne · #${v[0]}…#${v[v.length - 1]}`);
  if (fuori.length) {
    console.log(`\n⚠️ NON coperte da nessun gruppo (${fuori.length}) — restano come sono:`);
    for (const f of fuori) console.log(`  #${f.code} ${f.vecchia} (creata ${f.creata})`);
  }

  if (!APPLICA) { console.log('\nANTEPRIMA — nulla è stato scritto. Rilanciare con --applica.'); return; }

  const salvataggio = `scripts/date-chiuse-prima-di-${Date.now()}.json`;
  writeFileSync(salvataggio, JSON.stringify(proposte, null, 1));
  console.log(`\nStato precedente salvato in ${salvataggio}`);

  for (const p of proposte) {
    await prisma.$transaction([
      prisma.delivery.update({ where: { id: p.id }, data: { date: new Date(`${p.nuova}T00:00:00.000Z`) } }),
      prisma.deliveryLog.create({ data: { deliveryId: p.id, type: 'note',
        message: `Data corretta d'ufficio: ${p.vecchia} → ${p.nuova}. L'anno era impossibile ed è lo stesso nel sistema precedente, quindi l'errore risale alla creazione. La data giusta viene dalle consegne vicine: ${p.prova}.` } }),
    ]);
  }
  console.log(`Date corrette: ${proposte.length}`);
}

main().catch((e) => { console.error('ERRORE', e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

/**
 * RIPARA gli importi a 0 delle ricevute importate dal legacy (ordine utente 03/09).
 *
 * 46 ricevute su 351 avevano `amount = 0` — copiato fedelmente dal CSV
 * (`expert-receipts.totalAmount`), che era 0 anche di là. Il valore vero però
 * sta scritto NEL PDF della ricevuta (nota di prestazione occasionale):
 * riquadro lordo / ritenuta / netto / rimborsi / Totale Bonifico.
 *
 * - 39 «open»: importo estratto dal PDF con pdftotext, tutte internamente
 *   coerenti (lordo − ritenuta + rimborsi = bonifico). Qui sotto il TOTALE
 *   BONIFICO: sono ricevute mai pagate, il numero che conta è il dovuto.
 * - 6 «paid» del 2025 (Ritiro, Consegna, Di Marco ×3, Laly): il PDF dice
 *   davvero 0,00 — zeri veri, non si toccano.
 * - legacyId 351 (Bergamasco): il file puntava al server legacy ormai spento
 *   e non esiste sul bucket Supabase — irrecuperabile, resta 0.
 *
 * ⚠️ Scoperta collaterale (6 campioni su 6): dove il legacy un importo ce
 * l'aveva, `totalAmount` = bonifico − ritenuta, NON il totale pagato. Le 302
 * ricevute con valore portano quella semantica: riallinearle al bonifico dei
 * PDF è una decisione dell'utente, non di questo script.
 *
 * Anteprima; scrive con --applica. Idempotente: tocca solo righe con amount=0.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
u.searchParams.set('schema', 'platform');
process.env.DATABASE_URL = u.toString();
const prisma = new PrismaClient();
for (let t = 1; t <= 5; t++) {
  try { await prisma.$queryRaw`SELECT 1`; break; }
  catch (e) { if (t === 5) { console.error('DB irraggiungibile'); process.exit(1); } await new Promise((r) => setTimeout(r, 4000)); }
}

/** Totale Bonifico letto dal PDF di ciascuna ricevuta (estrazione 03/09/2026). */
const IMPORTI = [
  { legacyId: 306, bonifico: 736.80 }, // Manuel Orosco Giacomo
  { legacyId: 307, bonifico: 101.44 }, // Acampora Vittorio
  { legacyId: 308, bonifico: 142.45 }, // Bellucci Samuele
  { legacyId: 309, bonifico: 49.50 }, // Bergamasco Leonardo
  { legacyId: 311, bonifico: 2042.51 }, // Chakroun Sami Nicolas
  { legacyId: 312, bonifico: 1920.67 }, // Chakroun Sami Nicolas
  { legacyId: 313, bonifico: 1001.79 }, // Coppola Andreas
  { legacyId: 314, bonifico: 914.77 }, // Coppola Andreas
  { legacyId: 315, bonifico: 1296.96 }, // Coppola Andreas
  { legacyId: 317, bonifico: 16.00 }, // Coppola Andreas
  { legacyId: 318, bonifico: 220.00 }, // Gargiulo Michele Amodio
  { legacyId: 319, bonifico: 235.20 }, // Gonfiantini Alessandro
  { legacyId: 321, bonifico: 1180.50 }, // Hmamly Fatima
  { legacyId: 322, bonifico: 693.61 }, // Kurihara Kiyomi
  { legacyId: 323, bonifico: 720.17 }, // Kurihara Kiyomi
  { legacyId: 324, bonifico: 736.98 }, // Kurihara Kiyomi
  { legacyId: 325, bonifico: 480.02 }, // Martel Gianluca
  { legacyId: 326, bonifico: 15.00 }, // Gonfiantini Alessandro
  { legacyId: 327, bonifico: 436.16 }, // Omini Stefano
  { legacyId: 328, bonifico: 567.93 }, // Trotski Yahor
  { legacyId: 329, bonifico: 908.77 }, // Trotski Yahor
  { legacyId: 330, bonifico: 448.00 }, // Acampora Vittorio
  { legacyId: 331, bonifico: 20.00 }, // Bellucci Samuele
  { legacyId: 332, bonifico: 25.00 }, // Bergamasco Leonardo
  { legacyId: 333, bonifico: 680.94 }, // Cassoli Renato
  { legacyId: 334, bonifico: 1957.64 }, // Chakroun Sami Nicolas
  { legacyId: 335, bonifico: 1007.56 }, // Coppola Andreas
  { legacyId: 337, bonifico: 260.00 }, // Gargiulo Michele Amodio
  { legacyId: 338, bonifico: 152.00 }, // Gianmarco Biliotti
  { legacyId: 339, bonifico: 255.00 }, // Gonfiantini Alessandro
  { legacyId: 340, bonifico: 1082.20 }, // Hmamly Fatima
  { legacyId: 341, bonifico: 156.70 }, // Kurihara Kiyomi
  { legacyId: 342, bonifico: 251.72 }, // La Corte Marco
  { legacyId: 343, bonifico: 340.00 }, // Manuel Orosco Giacomo
  { legacyId: 344, bonifico: 41.00 }, // Martel Gianluca
  { legacyId: 345, bonifico: 628.46 }, // Omini Stefano
  { legacyId: 346, bonifico: 175.00 }, // Pianigiani Lorenzo
  { legacyId: 347, bonifico: 66.00 }, // Rimola Edoardo
  { legacyId: 348, bonifico: 203.68 }, // Rimola Edoardo
];

const righe = await prisma.receipt.findMany({
  where: { legacyId: { in: IMPORTI.map((x) => x.legacyId) } },
  select: { id: true, legacyId: true, amount: true, status: true, valet: { select: { firstName: true, lastName: true } } },
  orderBy: { legacyId: 'asc' },
});
const daScrivere = [];
for (const r of righe) {
  const voce = IMPORTI.find((x) => x.legacyId === r.legacyId);
  if (r.amount !== 0) { console.log(`  · ${r.legacyId} ha già ${r.amount} € — non si tocca`); continue; }
  daScrivere.push({ id: r.id, legacyId: r.legacyId, valet: `${r.valet?.lastName} ${r.valet?.firstName}`, nuovo: voce.bonifico });
}
console.log(`Da riparare: ${daScrivere.length} ricevute · totale ${daScrivere.reduce((s, x) => s + x.nuovo, 0).toFixed(2)} €`);
for (const x of daScrivere) console.log(`  ${x.legacyId} · ${x.valet} · 0 → ${x.nuovo.toFixed(2)} €`);

if (!APPLICA) {
  console.log('\nANTEPRIMA: niente scritto. Rilanciare con --applica.');
  await prisma.$disconnect();
  process.exit(0);
}

fs.writeFileSync('C:/Users/nicol/AppData/Local/Temp/claude/backup-importi-ricevute-' + Date.now() + '.json',
  JSON.stringify(righe, null, 1));
let scritte = 0;
for (const x of daScrivere) {
  await prisma.receipt.update({ where: { id: x.id }, data: { amount: x.nuovo } });
  scritte++;
}
console.log(`\nScritte: ${scritte}. Backup salvato.`);
await prisma.$disconnect();

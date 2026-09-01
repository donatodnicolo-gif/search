/**
 * CORREGGE i 4 ricorrenti «a ora» incoerenti col canone (utente 01/09:
 * «Sistema e verifica altre casistiche») e le loro figlie. Il censimento
 * (01/09) ha misurato che TUTTE le consegne a-ora fuori canone nate in
 * piattaforma sono figlie di questi 4 — zero casi sparsi. La prova è il
 * pattern del legacy sullo stesso partner e sulla stessa fascia:
 *
 * 1. Chanel Milano (ric. cmth5hkks006gld04qaa25h8c): price 50 GIUSTO, ma
 *    ore 1 e finestra 16:30-17:30 — il legacy dice 430× «2h · 16:30-18:30 ·
 *    50 €» (1h ne costa 25). → ore 2, finestra 16:30-18:30.
 * 2. Basara Washington 18:30-21:30 3h a 54 € (ric. cmthc4tyo0001lc04cv7empu1):
 *    54 = 3×18 = tariffa del «Servizio Ora con Approvazione», e nel legacy
 *    quella fascia girava proprio lì (27×, fino al 31/08). Era stata messa su
 *    «Servizio a Ora» (17 €/h) — la PRIMA voce della tendina, stesso errore
 *    di Chanel Sant'Andrea. → cambia servizio, il prezzo resta.
 * 3-4. Basara Washington 2,5h a 37,50 € (ric. cmthc6h30009vlc041nvjhwod e
 *    cmthc7q5w00adlc04yi7cizur): 37,50 = 2,5×15, tariffa mai esistita;
 *    il legacy su quelle fasce dice 45 (2,5×18). → price 45.
 *
 * Figlie: si toccano solo le VIVE senza fattura e senza riga di stipendio;
 * ogni cambio lascia una riga nel registro della consegna. Prova a vuoto di
 * default; con --applica scrive (backup json prima).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const APPLICA = process.argv.includes('--applica');
const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL = `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform`;
const prisma = new PrismaClient();

const approvazione = await prisma.serviceType.findFirst({
  where: { name: 'Servizio Ora con Approvazione', pricingModel: 'A_ORA' },
  select: { id: true, name: true },
});
if (!approvazione) { console.log('FERMO: non trovo «Servizio Ora con Approvazione».'); process.exit(1); }

const PIANI = [
  {
    rs: 'cmth5hkks006gld04qaa25h8c', nome: 'Chanel Milano 16:30 → 2 ore, finestra 16:30-18:30',
    datiRicorrente: { hours: 2, timeTo: '18:30' },
    figliaVa: (f) => f.hours !== 2 || f.deliveryTimeTo !== '18:30',
    datiFiglia: () => ({ hours: 2, deliveryTimeTo: '18:30' }),
    log: 'Ore corrette: 1 → 2 e finestra 16:30-18:30 (il prezzo 50 era già quello delle 2 ore; il legacy fa questa fascia in 2 ore da sempre). Correzione del ricorrente «Chanel Milano», 01/09.',
  },
  {
    rs: 'cmthc4tyo0001lc04cv7empu1', nome: 'Basara 18:30-21:30 → Servizio Ora con Approvazione',
    datiRicorrente: { serviceTypeId: approvazione.id },
    figliaVa: (f) => f.serviceTypeId !== approvazione.id,
    datiFiglia: () => ({ serviceTypeId: approvazione.id }),
    log: 'Servizio corretto: «Servizio a Ora» → «Servizio Ora con Approvazione» (54 € = 3h × 18: la tariffa è di questo servizio, e nel legacy la fascia 18:30-21:30 girava qui). Scelta involontaria nella tendina, come per Chanel Sant\'Andrea. Correzione del ricorrente, 01/09.',
  },
  {
    rs: 'cmthc6h30009vlc041nvjhwod', nome: 'Basara 18:30-21:00 → 45 €',
    datiRicorrente: { price: 45 },
    figliaVa: (f) => f.price !== 45,
    datiFiglia: () => ({ price: 45 }),
    log: 'Prezzo corretto: 37,50 → 45,00 (2,5h × 18 di listino; 37,50 = 2,5 × 15, tariffa mai esistita per Basara — il legacy su questa fascia dice 45). Correzione del ricorrente, 01/09.',
  },
  {
    rs: 'cmthc7q5w00adlc04yi7cizur', nome: 'Basara 19:00-21:30 → 45 €',
    datiRicorrente: { price: 45 },
    figliaVa: (f) => f.price !== 45,
    datiFiglia: () => ({ price: 45 }),
    log: 'Prezzo corretto: 37,50 → 45,00 (2,5h × 18 di listino; 37,50 = 2,5 × 15, tariffa mai esistita per Basara — il legacy su questa fascia dice 45). Correzione del ricorrente, 01/09.',
  },
];

const backup = [];
for (const piano of PIANI) {
  const rs = await prisma.recurringService.findUnique({ where: { id: piano.rs } });
  if (!rs) { console.log(`⚠️ ricorrente ${piano.rs} non trovato, salto`); continue; }
  const figlie = await prisma.delivery.findMany({
    where: { recurringServiceId: piano.rs, deletedAt: null },
    select: { id: true, code: true, status: true, invoiced: true, price: true, hours: true,
              deliveryTimeTo: true, serviceTypeId: true,
              salaryLines: { select: { id: true } }, invoiceLines: { select: { id: true } } },
  });
  const daFare = figlie.filter((f) => piano.figliaVa(f) && !f.invoiced && !f.salaryLines.length && !f.invoiceLines.length);
  const saltate = figlie.filter((f) => piano.figliaVa(f) && (f.invoiced || f.salaryLines.length || f.invoiceLines.length));
  console.log(`\n${piano.nome}`);
  console.log(`  figlie vive ${figlie.length} · da correggere ${daFare.length} · saltate (fatturate/in stipendio) ${saltate.length}`);
  if (saltate.length) for (const s of saltate) console.log(`  ⚠️ saltata #${s.code} [${s.status}]`);
  if (!APPLICA) continue;

  backup.push({ ricorrente: rs, figlie: daFare });
  await prisma.recurringService.update({ where: { id: piano.rs }, data: piano.datiRicorrente });
  for (const f of daFare) {
    await prisma.delivery.update({ where: { id: f.id }, data: {
      ...piano.datiFiglia(f),
      logs: { create: [{ type: 'service_fix', message: piano.log }] },
    } });
  }
  console.log(`  ✅ ricorrente aggiornato + ${daFare.length} figlie corrette`);
}

if (APPLICA) {
  const file = `C:/Users/nicol/AppData/Local/Temp/claude/backup-ricorrenti-a-ora-${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify(backup, null, 1));
  console.log(`\nBackup: ${file}`);
} else {
  console.log('\n(prova a vuoto: rilanciare con --applica)');
}
await prisma.$disconnect();

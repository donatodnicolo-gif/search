// ============================================================
// Ricostruisce la STORIA delle tariffe dei valet dagli importi pagati
// ------------------------------------------------------------
// Chiesto dall'utente il 25/08/2026 dopo aver visto che verificare le paghe
// dell'arretrato contro il listino di oggi non prova niente.
//
// ⚠️ QUESTA E' UNA RICOSTRUZIONE, NON UN DOCUMENTO. Le righe che scrive nascono
// dagli importi davvero pagati, non da un listino firmato: per questo vanno in
// `ValetService.origine = 'dedotta'`, e il risolutore `tariffaAllaData` fa
// vincere una riga documentata a parita' di periodo. Una tariffa dedotta serve a
// SPIEGARE la storia, non a certificarla.
//
// COME. Per ogni coppia valet+servizio si guardano le consegne pagabili con una
// paga positiva, si contano gli importi per MESE e si tiene, mese per mese,
// quello dominante. Quando l'importo dominante cambia e resta cambiato, li' c'e'
// un cambio di tariffa: si chiude il periodo precedente e se ne apre uno nuovo.
//
// ⚠️ Solo le tariffe FISSE si ricostruiscono cosi'. Dove la paga dipende dai
// chilometri l'importo non e' mai lo stesso due volte e nessun valore domina: in
// quel caso non si scrive niente e lo si dichiara, invece di inventare una
// tariffa da una media.
//
// ⚠️⚠️ E I SERVIZI A ORE RESTANO FUORI, anche se un importo dominante ce l'hanno.
// Li' la paga e' `tariffa x ore`: l'importo che ricorre e' quello del giro tipo,
// non la tariffa. Alla prima passata uscivano venti righe «25,00 € contro 12,50
// di oggi» — cioe' semplicemente due ore alla tariffa di oggi. Scriverle come
// tariffa le avrebbe fatte rimoltiplicare per le ore, raddoppiando la paga a
// ogni verifica futura. Un valore che ricorre non e' per forza un prezzo
// unitario: dipende da cosa lo moltiplica.
//
// Soglie, dichiarate perche' sono scelte e non verita':
//   - un mese conta se ha almeno MIN_CONSEGNE consegne pagate;
//   - un importo «domina» se copre almeno DOMINANZA delle consegne del mese;
//   - un periodo si apre solo se dura almeno MIN_MESI mesi di fila.
//
// PROVA A VUOTO DI DEFAULT. Si applica con --scrivi, si disfa con --disfa
// (cancella le sole righe `origine = 'dedotta'`).
//
// Uso: node scripts/ricostruisci-storia-tariffe-valet.mjs
// ============================================================
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const argomenti = process.argv.slice(2);
const SCRIVI = argomenti.includes('--scrivi');
const DISFA = argomenti.includes('--disfa');
const MIN_CONSEGNE = 8;
const DOMINANZA = 0.6;
const MIN_MESI = 2;

const riga = fs.readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));
process.env.DATABASE_URL =
  `postgresql://${u.username}:${u.password}@${u.hostname}:6543/postgres?schema=platform&pgbouncer=true&connection_limit=1`;
const db = new PrismaClient();
const eu = (n) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const r2 = (x) => Math.round(x * 100) / 100;

try {
  if (DISFA) {
    const n = await db.valetService.deleteMany({ where: { origine: 'dedotta' } });
    console.log(SCRIVI ? `cancellate ${n.count} righe dedotte.` : `da cancellare: righe con origine='dedotta'. Aggiungi --scrivi.`);
    if (!SCRIVI) { const q = await db.valetService.count({ where: { origine: 'dedotta' } }); console.log(`  sono ${q}`); }
    process.exit(0);
  }

  // le tariffe di oggi, per sapere quale sia «la corrente»
  const tutteCorrenti = await db.valetService.findMany({
    where: { origine: 'listino' },
    select: { id: true, valetId: true, serviceTypeId: true, salary: true, extraKmPrice: true,
      salaryPerItem: true, validFrom: true,
      valet: { select: { firstName: true, lastName: true } },
      serviceType: { select: { name: true, pricingModel: true } } },
  });
  const correnti = tutteCorrenti.filter((c) => c.serviceType?.pricingModel !== 'A_ORA');
  console.log(`righe di listino attuali: ${tutteCorrenti.length} — a ore, escluse: ${tutteCorrenti.length - correnti.length}`);

  const consegne = await db.delivery.findMany({
    where: { deletedAt: null, payable: true, valetId: { not: null }, valetSalary: { gt: 0 },
      valetServiceId: { not: null } },
    select: { date: true, valetSalary: true, valetId: true, valetServiceId: true },
  });
  console.log(`consegne pagate da cui ricostruire: ${consegne.length}`);

  // ⚠️⚠️ IL SERVIZIO DEL VALET NON E' QUELLO DEL PARTNER, e ci sono ricascato:
  // alla prima passata avevo raggruppato per `Delivery.serviceTypeId`, che e' il
  // servizio del PARTNER («Vendita Deluxy»), mentre il listino del valet sta su
  // un altro servizio («Consegna Standard»). Le chiavi non combaciavano con
  // nessuna riga e il risultato era «0 periodi trovati»: un vuoto perfettamente
  // credibile e perfettamente falso. La strada giusta e' `valetServiceId`, che
  // punta alla riga di listino e da li' dice valet e servizio.
  const righeListino = new Map((await db.valetService.findMany({
    select: { id: true, valetId: true, serviceTypeId: true },
  })).map((x) => [x.id, x]));

  // valet+servizio DEL VALET -> mese -> importo -> quante volte
  const perChiave = new Map();
  for (const d of consegne) {
    const vs = righeListino.get(d.valetServiceId);
    if (!vs) continue;
    const k = `${vs.valetId}|${vs.serviceTypeId}`;
    const mese = `${d.date.getUTCFullYear()}-${String(d.date.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!perChiave.has(k)) perChiave.set(k, new Map());
    const mesi = perChiave.get(k);
    if (!mesi.has(mese)) mesi.set(mese, new Map());
    const imp = mesi.get(mese);
    const v = r2(d.valetSalary);
    imp.set(v, (imp.get(v) ?? 0) + 1);
  }

  const proposte = [];
  let senzaDominante = 0;
  for (const [k, mesi] of perChiave) {
    const [valetId, serviceTypeId] = k.split('|');
    const corrente = correnti.find((c) => c.valetId === valetId && c.serviceTypeId === serviceTypeId);
    if (!corrente) continue;   // niente listino: non c'e' con cosa confrontare

    // il dominante di ogni mese
    const serie = [...mesi.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mese, imp]) => {
        const tot = [...imp.values()].reduce((s, n) => s + n, 0);
        if (tot < MIN_CONSEGNE) return { mese, valore: null };
        const [valore, quante] = [...imp.entries()].sort((a, b) => b[1] - a[1])[0];
        return { mese, valore: quante / tot >= DOMINANZA ? valore : null, quante, tot };
      });
    const utili = serie.filter((x) => x.valore != null);
    if (!utili.length) { senzaDominante++; continue; }

    // periodi consecutivi con lo stesso dominante
    const periodi = [];
    for (const x of utili) {
      const ultimo = periodi[periodi.length - 1];
      if (ultimo && ultimo.valore === x.valore) ultimo.fine = x.mese;
      else periodi.push({ valore: x.valore, inizio: x.mese, fine: x.mese, mesi: 0 });
    }
    for (const p of periodi) {
      p.mesi = utili.filter((x) => x.mese >= p.inizio && x.mese <= p.fine).length;
    }
    const solidi = periodi.filter((p) => p.mesi >= MIN_MESI);
    // il periodo che coincide col listino di oggi non serve: e' gia' in tabella
    const daScrivere = solidi.filter((p) => Math.abs(p.valore - corrente.salary) > 0.011);
    if (!daScrivere.length) continue;

    for (const p of daScrivere) {
      const [ay, am] = p.inizio.split('-').map(Number);
      const [by, bm] = p.fine.split('-').map(Number);
      proposte.push({
        valetId, serviceTypeId, salary: p.valore,
        // stessa struttura di prezzo della corrente: cambia l'importo, non il modello
        extraKmPrice: corrente.extraKmPrice, salaryPerItem: corrente.salaryPerItem,
        validFrom: new Date(Date.UTC(ay, am - 1, 1)),
        validTo: new Date(Date.UTC(by, bm, 0, 23, 59, 59)),
        chi: `${corrente.valet?.firstName} ${corrente.valet?.lastName}`,
        servizio: corrente.serviceType?.name,
        oggi: corrente.salary, mesi: p.mesi, dal: p.inizio, al: p.fine,
      });
    }
  }

  console.log(`\ncoppie valet+servizio senza un importo dominante (paga a km): ${senzaDominante}`);
  console.log(`periodi di tariffa DIVERSI da quello di oggi: ${proposte.length}`);
  console.log('\n| valet | servizio | dal | al | tariffa di allora | oggi | mesi |');
  console.log('|---|---|---|---|---|---|---|');
  for (const p of proposte.sort((a, b) => b.mesi - a.mesi).slice(0, 25)) {
    console.log(`| ${p.chi} | ${p.servizio} | ${p.dal} | ${p.al} | ${eu(p.salary)} | ${eu(p.oggi)} | ${p.mesi} |`);
  }
  if (proposte.length > 25) console.log(`… e altri ${proposte.length - 25}`);

  if (!SCRIVI) { console.log('\nPROVA A VUOTO — non ho scritto niente. Rilancia con --scrivi.'); process.exit(0); }

  let scritte = 0;
  for (const p of proposte) {
    try {
      await db.valetService.create({ data: {
        valetId: p.valetId, serviceTypeId: p.serviceTypeId, salary: p.salary,
        extraKmPrice: p.extraKmPrice, salaryPerItem: p.salaryPerItem,
        validFrom: p.validFrom, validTo: p.validTo, origine: 'dedotta' } });
      scritte++;
    } catch (e) {
      console.log(`  ⚠️ ${p.chi} · ${p.servizio} · ${p.dal}: ${String(e.message).split('\n')[0].slice(0, 90)}`);
    }
  }
  console.log(`\nscritte ${scritte} righe di tariffa dedotta.`);
  console.log(`controprova: ${await db.valetService.count({ where: { origine: 'dedotta' } })} righe con origine='dedotta' in tabella.`);
  console.log('per disfare: node scripts/ricostruisci-storia-tariffe-valet.mjs --disfa --scrivi');
} finally {
  await db.$disconnect();
}

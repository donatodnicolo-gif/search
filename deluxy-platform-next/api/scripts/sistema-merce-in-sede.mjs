/**
 * ⭐⭐ 11/09/2026 (istruzioni utente) — DUE PULIZIE SU «MERCE IN SEDE».
 *
 * **(1) Le date impossibili.** Fra le consegne aperte con data passata ce n'erano 52 con una data che
 * non può esistere: 0202, 0206, 2004, e un blocco di 49 tutte al 25/09/2012. Non è un difetto della
 * migrazione — il database precedente ha esattamente le stesse date, quindi l'errore è stato fatto il
 * giorno in cui sono nate. La data giusta la dicono gli id vicini, che sono progressivi e raccontano
 * in che giorni si stava lavorando:
 *
 *  · #18694 (0202-03-27) — i vicini sono tutti creati il 21/03/2024 e consegnati fra il 21 e il 25 marzo
 *    → **2024-03-27** (l'anno è stato digitato «0202» invece di «2024», giorno e mese reggono).
 *  · #52156 (0206-02-16) — vicini creati il 10/02/2026, consegne fra il 10 e il 14 febbraio → **2026-02-16**.
 *  · #61549 (2004-07-18) — vicini creati e consegnati il 18/07/2026 → **2026-07-18**.
 *  · #47532…#47580 (2012-09-25, 49 consegne) — nate tutte insieme il 07/12/2025 alle 21:24, stesso
 *    partner, stesso servizio; le sei subito successive (#47581…#47586), create nello stesso minuto,
 *    portano la data **2025-12-09**. Quella è la data del blocco.
 *
 * ⚠️ Non si tocca lo stato: la data si corregge perché l'errore è dimostrato, ma decidere che una
 * consegna del 2025 è da annullare è una scelta di chi lavora, non di uno script.
 *
 * **(2) Le non consegnate senza destinazione** (istruzione utente: «le consegne non consegnate per ora
 * chiudile, misureremo l'analisi dalle prossime»). Sono i mancati recapiti in cui nessuno ha detto dove
 * fosse finita la merce. Si chiudono con un valore che dice **la verità**: `closedNoInfo`, cioè
 * «chiusa dall'ufficio, destinazione mai dichiarata». ⚠️ NON si scrive una delle tre destinazioni vere
 * (boutique, auto del valet, magazzino): sarebbe inventare dove sta la merce, e fra sei mesi nessuno
 * saprebbe più che quel dato è finto. Con questo valore escono dal contatore e non entrano in nessuna
 * colonna — che è esattamente quello che significa «per ora chiudile».
 *
 * Uso:  node scripts/sistema-merce-in-sede.mjs [--applica]
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

/** Le date da correggere: codice → data giusta, con la ragione scritta accanto. */
const DATE = new Map();
DATE.set(18694, { data: '2024-03-27', perche: 'i vicini (#18688-#18700) sono creati il 21/03/2024 e consegnati fra il 21 e il 25 marzo' });
DATE.set(52156, { data: '2026-02-16', perche: 'i vicini (#52150-#52162) sono creati il 10/02/2026 e consegnati fra il 10 e il 14 febbraio' });
DATE.set(61549, { data: '2026-07-18', perche: 'i vicini (#61543-#61555) sono creati e consegnati il 18/07/2026' });
for (let c = 47532; c <= 47580; c++) {
  DATE.set(c, { data: '2025-12-09', perche: 'blocco creato il 07/12/2025 alle 21:24; le consegne subito successive (#47581-#47586) dello stesso blocco portano la data 09/12/2025' });
}

async function main() {
  const codici = [...DATE.keys()];
  const conDataStorta = await prisma.delivery.findMany({
    where: { code: { in: codici }, deletedAt: null },
    select: { id: true, code: true, date: true, status: true, partner: { select: { insegna: true } } },
    orderBy: { code: 'asc' },
  });

  console.log(`\n=== 1. DATE IMPOSSIBILI (${conDataStorta.length} consegne trovate su ${codici.length} cercate) ===`);
  const daCambiare = [];
  for (const d of conDataStorta) {
    const giusta = DATE.get(d.code);
    const attuale = d.date ? new Date(d.date).toISOString().slice(0, 10) : null;
    if (attuale === giusta.data) { console.log(`  #${d.code} già a posto`); continue; }
    daCambiare.push({ ...d, nuova: giusta.data, perche: giusta.perche, vecchia: attuale });
  }
  for (const d of daCambiare.slice(0, 5)) console.log(`  #${d.code} ${d.vecchia} → ${d.nuova}  (${d.status}, ${d.partner?.insegna ?? '—'})`);
  if (daCambiare.length > 5) console.log(`  … e altre ${daCambiare.length - 5}`);

  const daChiudere = await prisma.$queryRawUnsafe(`
    SELECT d."id", d."code", d."date"::date AS data, COALESCE(p."insegna",'—') AS partner
    FROM platform."Delivery" d LEFT JOIN platform."Partner" p ON p."id" = d."partnerId"
    WHERE d."deletedAt" IS NULL AND d."status" = 'not_delivered'
      AND COALESCE(NULLIF(d."productManagement", ''), 'none') = 'none'
      AND d."date" < CURRENT_DATE
    ORDER BY d."date"`);
  console.log(`\n=== 2. NON CONSEGNATE SENZA DESTINAZIONE (${daChiudere.length}) ===`);
  for (const d of daChiudere.slice(0, 8)) console.log(`  #${d.code} ${String(d.data).slice(0, 10)} ${d.partner}`);
  if (daChiudere.length > 8) console.log(`  … e altre ${daChiudere.length - 8}`);

  if (!APPLICA) { console.log('\nANTEPRIMA — nulla è stato scritto. Rilanciare con --applica.'); return; }

  const salvataggio = `scripts/merce-prima-di-${Date.now()}.json`;
  writeFileSync(salvataggio, JSON.stringify({ date: daCambiare, chiuse: daChiudere }, null, 1));
  console.log(`\nStato precedente salvato in ${salvataggio}`);

  let n = 0;
  for (const d of daCambiare) {
    await prisma.$transaction([
      prisma.delivery.update({ where: { id: d.id }, data: { date: new Date(`${d.nuova}T00:00:00.000Z`) } }),
      prisma.deliveryLog.create({ data: { deliveryId: d.id, type: 'note',
        message: `Data corretta d'ufficio: ${d.vecchia} → ${d.nuova}. La data precedente non può esistere ed è la stessa nel sistema precedente, quindi l'errore risale alla creazione. ${d.perche}.` } }),
    ]);
    n++;
  }
  console.log(`Date corrette: ${n}`);

  /**
   * ⚠️ A blocchi, non una alla volta: sono 1.587 righe e la connessione al database passa dal pooler.
   * Millesettecento andate e ritorni sono minuti di attesa e altrettante occasioni di fermarsi a metà;
   * dentro la transazione la riga e la sua nota si scrivono insieme o non si scrive niente.
   */
  const NOTA = "Chiusa d'ufficio: mancato recapito senza destinazione dichiarata. Nessuno ha indicato dove sia finita la merce e la consegna è troppo vecchia per ricostruirlo; si chiude senza inventare una destinazione. Il conteggio riparte dai mancati recapiti successivi.";
  let m = 0;
  for (let i = 0; i < daChiudere.length; i += 200) {
    const blocco = daChiudere.slice(i, i + 200);
    const ids = blocco.map((d) => d.id);
    await prisma.$transaction([
      prisma.delivery.updateMany({ where: { id: { in: ids } }, data: { productManagement: 'closedNoInfo' } }),
      prisma.deliveryLog.createMany({ data: ids.map((deliveryId) => ({ deliveryId, type: 'note', message: NOTA })) }),
    ]);
    m += blocco.length;
    console.log(`  chiuse ${m}/${daChiudere.length}`);
  }
  console.log(`Non consegnate chiuse: ${m}`);
}

main().catch((e) => { console.error('ERRORE', e); process.exitCode = 1; }).finally(() => prisma.$disconnect());

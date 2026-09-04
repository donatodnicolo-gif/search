// VERIFICA DELLA SALUTE — conta il registro in tutti e due i modi e li confronta.
//
// `salute.ts` scrive la stessa regola in due linguaggi: un test in memoria
// (`saluteOrdine`) e un filtro Prisma (`whereSalute`). Il primo lo usa la
// pagina per stampare il badge sulla riga che ha già in mano, il secondo lo usa
// il filtro dell'elenco, che è PAGINATO e quindi deve chiedere al database.
// Se i due divergono, l'elenco filtrato per «a rischio» mostra righe con il
// badge «conforme» — e nessun test unitario se ne accorgerebbe, perché ognuno
// dei due è coerente con se stesso.
//
// Questo script è l'unico controllo che li mette uno contro l'altro, sui dati
// veri e non su casi inventati. Va rilanciato ogni volta che si tocca una
// regola.
//
//   npx tsx scripts/verifica-salute.ts

import { PrismaClient } from "@prisma/client";
import { SALUTI_IN_ORDINE, saluteOrdine, whereSalute, ETICHETTE_SALUTE } from "../src/lib/salute";

const prisma = new PrismaClient();

async function main() {
  const ordini = await prisma.ordine.findMany({
    select: {
      id: true,
      numero: true,
      brand: true,
      annullatoIl: true,
      motivoAnnullamento: true,
      financialStatus: true,
      rischioLivello: true,
      rischioRaccomandazione: true,
    },
  });

  // 1. In memoria.
  const inMemoria = new Map<string, string>();
  const conta: Record<string, number> = {};
  for (const o of ordini) {
    const s = saluteOrdine(o);
    inMemoria.set(o.id, s);
    conta[s] = (conta[s] ?? 0) + 1;
  }

  // 2. Dal database, con lo stesso filtro che usa l'elenco.
  console.log(`Registro: ${ordini.length} ordini\n`);
  console.log("salute        in memoria   dal database   scarto");
  let scartoTotale = 0;
  const dalDb = new Map<string, string>();
  for (const s of SALUTI_IN_ORDINE) {
    const righe = await prisma.ordine.findMany({ where: whereSalute(s), select: { id: true } });
    for (const r of righe) {
      // Se una riga esce da due filtri diversi le regole si sovrappongono:
      // vuol dire che la precedenza non sta escludendo ciò che dovrebbe.
      if (dalDb.has(r.id)) {
        console.log(`  ⚠️ ordine ${r.id} esce sia da «${dalDb.get(r.id)}» sia da «${s}»`);
        scartoTotale++;
      }
      dalDb.set(r.id, s);
    }
    const a = conta[s] ?? 0;
    const b = righe.length;
    if (a !== b) scartoTotale += Math.abs(a - b);
    const pct = ((a * 100) / ordini.length).toFixed(1);
    console.log(
      `${ETICHETTE_SALUTE[s].nome.padEnd(12)} ${String(a).padStart(9)} ${String(b).padStart(14)} ${
        a === b ? "     ok" : `  ${b - a > 0 ? "+" : ""}${b - a}`
      }   (${pct}%)`,
    );
  }

  // 3. Ordine per ordine, non solo i totali: due errori opposti si
  // compenserebbero nei conteggi e passerebbero inosservati.
  let diversi = 0;
  for (const o of ordini) {
    const a = inMemoria.get(o.id);
    const b = dalDb.get(o.id);
    if (a !== b) {
      if (diversi < 10) {
        console.log(`  ⚠️ ${o.brand} ${o.numero}: in memoria «${a}», dal database «${b ?? "nessun filtro"}»`);
      }
      diversi++;
    }
  }

  console.log("");
  if (dalDb.size !== ordini.length) {
    console.log(`❌ ${ordini.length - dalDb.size} ordini non escono da NESSUN filtro: la regola non copre tutto.`);
  }
  if (diversi || scartoTotale) {
    console.log(`❌ ${diversi} ordini classificati in modo diverso dai due percorsi.`);
    process.exitCode = 1;
  } else {
    console.log(`✅ I due percorsi coincidono su tutti e ${ordini.length} gli ordini.`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

// **Le bozze fantasma lasciate dal salvataggio automatico.**
//
// Hanno il testo — nome, categoria, descrizione, sezioni — e null'altro: né
// prezzo, né varianti, né foto, né pubblicazioni. È l'insieme esatto di campi
// che scrive `/api/prodotti/bozza`, quindi sono schede nate da una compilazione
// mai portata a termine (o, fino al 10/09/2026, da una **duplicazione**: là
// l'autosalvataggio non doveva girare, ed è stato spento).
//
// ⚠️ **Si ARCHIVIA, non si cancella.** Sono prodotti veri: cancellandoli si
// perde ogni traccia di come sono nati, e la regola di casa è che i dati reali
// non si cancellano. Archiviate escono dagli elenchi di lavoro lo stesso.
//
//   npx tsx scripts/bozze-fantasma.ts              # elenca, non tocca niente
//   npx tsx scripts/bozze-fantasma.ts --archivia

import { caricaEnv } from "./vecchio-gestionale";

/** Da quando il salvataggio automatico è vivo: prima non poteva averle create lui. */
const DA = new Date("2026-09-09T15:00:00Z");

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");

  const p = await prisma.prodotto.findMany({
    where: { creatoIl: { gte: DA }, fase: "concept", tipologiaVendita: null, prezzoVendita: 0 },
    select: {
      id: true,
      codice: true,
      nome: true,
      creatoIl: true,
      _count: { select: { varianti: true, media: true, pubblicazioni: true, vendite: true } },
    },
    orderBy: { creatoIl: "asc" },
  });
  const fantasmi = p.filter(
    (x) => x._count.varianti === 0 && x._count.media === 0 && x._count.pubblicazioni === 0 && x._count.vendite === 0,
  );

  console.log(`bozze candidate (concept, senza classificazione, prezzo 0): ${p.length}`);
  console.log(`di cui SENZA varianti, foto, pubblicazioni e vendite — i fantasmi: ${fantasmi.length}\n`);
  for (const x of fantasmi) {
    console.log(`  ${x.creatoIl.toISOString().slice(0, 16)}  ${(x.codice ?? "").padEnd(10)} ${x.nome.slice(0, 50)}`);
  }

  if (!process.argv.includes("--archivia")) {
    console.log("\nProva: niente scritto. Rilancia con --archivia.");
    await prisma.$disconnect();
    return;
  }

  // ⚠️ Si ricontrolla riga per riga PRIMA di scrivere: fra l'elenco qui sopra e
  // l'archiviazione qualcuno può aver ripreso in mano una di queste schede, e
  // archiviare un prodotto su cui si sta lavorando è peggio del disordine.
  let fatti = 0;
  let saltati = 0;
  for (const x of fantasmi) {
    const ora = await prisma.prodotto.findUnique({
      where: { id: x.id },
      select: {
        fase: true,
        shopifyId: true,
        _count: { select: { varianti: true, media: true, pubblicazioni: true, vendite: true } },
      },
    });
    const ancoraFantasma =
      !!ora &&
      ora.fase === "concept" &&
      !ora.shopifyId &&
      ora._count.varianti === 0 &&
      ora._count.media === 0 &&
      ora._count.pubblicazioni === 0 &&
      ora._count.vendite === 0;
    if (!ancoraFantasma) {
      console.log(`  saltata ${x.codice}: non è più una bozza vuota.`);
      saltati++;
      continue;
    }
    await prisma.prodotto.update({ where: { id: x.id }, data: { fase: "archiviato" } });
    fatti++;
  }
  console.log(`\nArchiviate ${fatti}${saltati ? `, saltate ${saltati}` : ""}. Le schede restano, escono dagli elenchi.`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(String(e).split("\n")[0]);
  process.exit(1);
});

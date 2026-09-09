// **Riempie la colonna `ordine` delle varianti con l'ordine che avevano.**
//
// La colonna nasce a 0 per tutte: senza questo passaggio l'ordinamento
// «ordine asc» le mescolerebbe fra loro, cioè il primo effetto della modifica
// sarebbe **perdere** l'ordine che si voleva conservare.
//
//   npx tsx scripts/ordina-varianti.ts            # prova, non scrive
//   npx tsx scripts/ordina-varianti.ts --applica

import { caricaEnv } from "./vecchio-gestionale";

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const applica = process.argv.includes("--applica");

  const prodotti = await prisma.prodotto.findMany({
    where: { varianti: { some: {} } },
    select: { id: true, codice: true, varianti: { orderBy: { creataIl: "asc" }, select: { id: true, nome: true, ordine: true } } },
  });
  const daScrivere = prodotti.flatMap((p) =>
    p.varianti.map((v, i) => ({ id: v.id, ordine: i })).filter((x, i) => p.varianti[i].ordine !== x.ordine),
  );
  console.log(`Prodotti con varianti: ${prodotti.length} · varianti da numerare: ${daScrivere.length}`);
  for (const p of prodotti.slice(0, 3)) console.log(`  ${p.codice}: ${p.varianti.map((v) => v.nome).join(" → ")}`);
  if (!applica) { console.log("\nProva: niente scritto. Rilancia con --applica."); await prisma.$disconnect(); return; }
  let n = 0;
  for (let i = 0; i < daScrivere.length; i += 200) {
    const blocco = daScrivere.slice(i, i + 200);
    await prisma.$transaction(blocco.map((v) => prisma.variante.update({ where: { id: v.id }, data: { ordine: v.ordine } })));
    n += blocco.length;
  }
  console.log(`Numerate ${n} varianti.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

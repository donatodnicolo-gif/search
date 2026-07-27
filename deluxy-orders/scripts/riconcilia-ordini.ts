// Rimette insieme quello che il registro sa già ma tiene in pezzi diversi:
// la CITTÀ di consegna dedotta dai tag o dal nome del prodotto per gli ordini
// che l'indirizzo non ce l'hanno, e la CATEGORIA dedotta dai tag per gli ordini
// che i titoli non hanno riconosciuto.
//
// Non tocca chi il dato ce l'ha già: rilanciarlo non cambia niente.
//
// Uso: npm run riconcilia
import { prisma } from "../src/lib/db";
import { riconcilia } from "../src/lib/riconcilia";

async function main() {
  const t = Date.now();
  const e = await riconcilia();
  console.log(`\nfatto in ${Math.round((Date.now() - t) / 1000)}s\n`);
  console.log(`città dedotta dai TAG:            ${e.cittaDaTag}`);
  console.log(`città dedotta dal NOME PRODOTTO:  ${e.cittaDaProdotto}`);
  console.log(`scartate dalla controprova:       ${e.scartatePerControprova}`);
  console.log(`restano senza città:              ${e.cittaSenzaRisposta}`);
  console.log(`categorie dedotte dai tag:        ${e.categorieDaTag}`);
  console.log(`\ncittà che nei titoli NON sono destinazioni (smentite dai fatti):`);
  console.log(`  ${e.cittaSmentite.join(", ") || "(nessuna)"}`);
  console.log(`\nesempi:`);
  e.esempi.forEach((x) => console.log(`  ${x}`));
  await prisma.$disconnect();
}
main();

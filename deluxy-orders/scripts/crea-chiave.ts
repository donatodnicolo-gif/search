// Crea (o rigenera) una chiave API per un'app client di Deluxy Orders.
// Uso:  npm run chiave -- <nome-app> [--scrittura] [--rigenera]
// Esempi:
//   npm run chiave -- deluxy-search                 (sola lettura)
//   npm run chiave -- deluxy-partner --scrittura    (lettura + riclassifica via PATCH)
//   npm run chiave -- deluxy-search --rigenera      (nuova chiave, stessa app)
//
// Le chiavi si creano anche dalla pagina **Impostazioni** dell'app, che è il
// modo normale; questo script resta per quando l'app non è raggiungibile.
//
// La generazione NON è scritta qui: sta in `src/lib/chiavi.ts`, lo stesso posto
// da cui la crea la pagina. Due modi di generare una credenziale divergono, e
// sulle credenziali divergere vuol dire scoprirlo il giorno che una non va.
import { prisma } from "../src/lib/db";
import { creaChiave } from "../src/lib/chiavi";

const argomenti = process.argv.slice(2).filter((a) => a !== "--");
const nome = argomenti.find((a) => !a.startsWith("--"));
const scrittura = argomenti.includes("--scrittura");
const rigenera = argomenti.includes("--rigenera");

if (!nome) {
  console.error("Uso: npm run chiave -- <nome-app> [--scrittura] [--rigenera]");
  process.exit(1);
}

const esito = await creaChiave(nome, scrittura, rigenera);

if (!esito.ok) {
  console.error(esito.motivo);
  console.error("Aggiungi --rigenera per sostituire il segreto della chiave esistente.");
  await prisma.$disconnect();
  process.exit(1);
}

console.log(
  `Chiave API ${esito.rigenerata ? "RIGENERATA" : "creata"} per "${esito.nome}" (${scrittura ? "lettura + scrittura" : "sola lettura"}):`,
);
console.log();
console.log(`  ${esito.chiave}`);
console.log();
console.log("Conservala ora: non sarà più recuperabile (nel DB c'è solo l'hash).");
if (esito.rigenerata) console.log("La chiave di prima ha smesso di funzionare in questo istante.");

await prisma.$disconnect();

// Classifica le ricorrenze «da precisare» leggendo le PAROLE del biglietto e
// della nota dell'ordine (senza AI). Prova a secco di default; con --applica
// scrive tipo, tipoDa="parole", motivo e prova.
//
//   npx tsx scripts/classifica-eventi-parole.ts            # conta soltanto
//   npx tsx scripts/classifica-eventi-parole.ts --applica  # scrive
import { classificaEventiDaParole } from "../src/lib/eventi-parole";
import { prisma } from "../src/lib/db";

async function main() {
  const applica = process.argv.includes("--applica");
  const t = Date.now();
  const esito = await classificaEventiDaParole({ applica });
  console.log(applica ? "APPLICATO" : "PROVA A SECCO", `in ${Math.round((Date.now() - t) / 1000)} s`);
  console.log(`esaminati ${esito.esaminati} · riconosciuti ${esito.riconosciuti} · senza testo ${esito.senzaTesto}`);
  console.log("per tipo:", JSON.stringify(esito.perTipo));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

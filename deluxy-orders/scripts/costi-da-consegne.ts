// IMPORTA IL COSTO DEL FORNITORE DALLE CONSEGNE DELLA PIATTAFORMA (per DDT).
//
//   npm run costi:consegne              → PROVA: guarda e non scrive niente
//   npm run costi:consegne -- --scrivi  → scrive davvero
//
// La prova è il modo normale di usarlo. Questo tocca il campo su cui si calcola
// il margine di ogni ordine: prima si guardano i numeri, poi si decide.
//
// La regola, il perché del DDT e soprattutto QUALE numero si prende (il valore
// della merce per il partner, non il prezzo della consegna, che è denaro nel
// verso opposto) stanno in `src/lib/costi-consegne.ts`. Leggerlo prima di
// lanciare con `--scrivi`.

import { costiDalleConsegne } from "../src/lib/costi-consegne";

async function main() {
  const scrivi = process.argv.includes("--scrivi");

  console.log(
    scrivi
      ? "SCRITTURA: il costo verrà salvato sugli ordini che non ne hanno uno.\n"
      : "PROVA: nessuna riga verrà toccata. Aggiungi --scrivi per salvare.\n",
  );

  const e = await costiDalleConsegne({ scrivi });

  if (e.errore) {
    console.error(`\n❌ ${e.errore}`);
    process.exitCode = 1;
    return;
  }

  console.log("── Cosa è stato letto dalla piattaforma ─────────────────────");
  console.log(`consegne lette              ${e.consegneLette.toLocaleString("it-IT")}`);
  console.log(`  con un DDT                ${e.conDdt.toLocaleString("it-IT")}`);
  console.log(`  senza DDT (saltate)       ${e.senzaDdt.toLocaleString("it-IT")}`);
  console.log("");
  console.log("── Cosa è stato scartato, e perché ─────────────────────────");
  console.log(`annullate / non accettate   ${e.consegneNulle.toLocaleString("it-IT")}`);
  console.log(`valore merce a zero         ${e.valoreAssente.toLocaleString("it-IT")}`);
  console.log(`DDT senza ordine di qui     ${e.ddtSenzaOrdine.toLocaleString("it-IT")}`);
  console.log(`DDT ambiguo (più ordini)    ${e.ddtAmbigui.toLocaleString("it-IT")}`);
  console.log(`ordine col costo già scritto ${e.costoGiaDeciso.toLocaleString("it-IT")}  (la mano batte il ritiro)`);
  console.log(`ordini con PIÙ consegne     ${e.ordiniConPiuConsegne.toLocaleString("it-IT")}  ⚠️ da guardare a mano, non sommati`);
  console.log("");
  console.log("── Il risultato ────────────────────────────────────────────");
  console.log(
    `ordini che prendono il costo ${e.ordiniDaScrivere.toLocaleString("it-IT")}` +
      `   per ${e.euroDaScrivere.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}`,
  );
  if (scrivi) console.log(`SCRITTI                      ${e.scritti.toLocaleString("it-IT")}`);

  if (e.esempi.length) {
    console.log("\nEsempi (i primi 15):");
    console.table(
      e.esempi.map((x) => ({
        ordine: x.ordine,
        euro: x.euro,
        partner: x.partner ?? "—",
        trovato: x.via === "ddt-id" ? "DDT = id ordine" : "DDT = numero ordine",
      })),
    );
  }

  if (e.daGuardare.length) {
    console.log("\n⚠️ Ordini con più di una consegna — NON toccati, decide una persona:");
    console.table(e.daGuardare);
  }

  if (!scrivi && e.ordiniDaScrivere > 0) {
    console.log("\nSe i numeri qui sopra convincono:  npm run costi:consegne -- --scrivi");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/db");
    await prisma.$disconnect();
  });

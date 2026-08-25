// RIPARAZIONE del 25/08/2026: uno stato scritto su un'anagrafica sbagliata.
//
// ⚠️⚠️ Correggere il codice non basta: il difetto aveva già scritto. Il match
// per nome aveva agganciato «Paradis des fleurs» al contenitore «Contatti senza
// azienda (HubSpot)» (288 contatti dentro, le tre parole sparse fra loro), e il
// Customer Service gli aveva messo `statoFornitore: abituale`. Quel contenitore
// non è un'azienda e non ci fornisce niente.
//
// Tocca UN campo su UN record, e lascia una riga nello storico delle modifiche:
// una correzione silenziosa è indistinguibile da un altro errore.
//
//   npx tsx scripts/ripara-aggancio-sbagliato.mts           (prova, non scrive)
//   npx tsx scripts/ripara-aggancio-sbagliato.mts --scrivi
import "dotenv/config";
import { prisma } from "../src/lib/db";

const scrivi = process.argv.includes("--scrivi");
const ID = "cmruwsz4k0000i6gc3wuhtzum"; // Contatti senza azienda (HubSpot)

const p = await prisma.partner.findUnique({
  where: { id: ID },
  select: { id: true, nome: true, statoFornitore: true },
});
if (!p) {
  console.log("record non trovato: niente da riparare");
  process.exit(0);
}
console.log(`«${p.nome}» → statoFornitore attuale: ${p.statoFornitore ?? "(vuoto)"}`);

// ⚠️ Si tocca SOLO se è ancora quello sbagliato: se nel frattempo qualcuno ha
// deciso altro, decide lui.
if (p.statoFornitore !== "abituale") {
  console.log("non è più «abituale»: non tocco niente.");
  process.exit(0);
}
if (!scrivi) {
  console.log("PROVA: metterei statoFornitore a vuoto e scriverei la riga nello storico.");
  process.exit(0);
}
await prisma.partner.update({ where: { id: ID }, data: { statoFornitore: null } });
await prisma.modifica.create({
  data: {
    partnerId: ID,
    entita: "partner",
    campo: "statoFornitore",
    da: "abituale",
    a: null,
    origine: "ui",
    autore:
      "correzione 25/08/2026: era stato scritto per un aggancio sbagliato del match per nome (Paradis des fleurs)",
  },
});
console.log("fatto: statoFornitore rimesso a vuoto, con la riga nello storico.");
await prisma.$disconnect();

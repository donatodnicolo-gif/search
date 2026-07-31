// Migrazione 31/07/2026 — «in contatto / in attesa / da ricontattare» smettono
// di essere STATI COMMERCIALI e diventano il LIVELLO del contatto.
//
// Non erano gradini del funnel ma il momento del contatto, e stando nella
// stessa lista costringevano a scegliere fra due cose vere insieme: «è un
// prospect» e «sta aspettando una risposta».
//
// Cosa fa, per ogni anagrafica che ha uno dei tre valori:
//   livello = il vecchio valore   (l'informazione non si perde)
//   stato   = prospect            (scelta dell'utente: sono contattate ma non
//                                  ancora in trattativa; nessuna resta senza
//                                  stato commerciale)
// e scrive il passaggio nello storico, così sulla scheda si vede che è stata
// una migrazione e non una decisione di qualcuno.
//
//   node scripts/migra-livello.mjs --prova   → elenca e non scrive
//   node scripts/migra-livello.mjs           → esegue
//
// È rieseguibile: dopo il primo giro non trova più niente da spostare.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const prova = process.argv.includes("--prova");
// Vecchio stato commerciale → stato che resta + livello che nasce.
// «a rischio» diventa CLIENTE, non prospect: chi è a rischio compra ancora, ed
// è proprio il motivo per cui era un pessimo stato commerciale — toglieva la
// parola «cliente» a chi cliente lo è.
const SPOSTAMENTI = {
  in_contatto: "prospect",
  in_attesa: "prospect",
  da_ricontattare: "prospect",
  non_interessato: "prospect",
  a_rischio: "attivo",
};
const DA_SPOSTARE = Object.keys(SPOSTAMENTI);

async function main() {
  const partner = await prisma.partner.findMany({
    where: { stato: { in: DA_SPOSTARE } },
    select: { id: true, nome: true, stato: true, livello: true, citta: true },
    orderBy: { nome: "asc" },
  });

  if (partner.length === 0) {
    console.log("Niente da migrare: nessuna anagrafica ha più uno dei tre valori come stato.");
    return;
  }

  const perStato = {};
  for (const p of partner) perStato[p.stato] = (perStato[p.stato] ?? 0) + 1;
  console.log(`${partner.length} anagrafiche da migrare:`);
  for (const [st, n] of Object.entries(perStato)) console.log(`  ${st}: ${n} → stato ${SPOSTAMENTI[st]}, livello ${st}`);

  // Un livello già scritto a mano vince: non lo si sovrascrive con quello
  // dedotto dal vecchio stato.
  const conLivello = partner.filter((p) => p.livello);
  if (conLivello.length > 0) {
    console.log(`  (${conLivello.length} hanno già un livello: si tiene quello, si cambia solo lo stato)`);
  }

  if (prova) {
    console.log("\n--prova: non ho scritto niente. Primi 10:");
    for (const p of partner.slice(0, 10)) {
      console.log(`  ${p.nome}${p.citta ? " · " + p.citta : ""} — ${p.stato} → ${SPOSTAMENTI[p.stato]} + livello ${p.livello ?? p.stato}`);
    }
    return;
  }

  let fatte = 0;
  for (const p of partner) {
    await prisma.partner.update({
      where: { id: p.id },
      data: { stato: SPOSTAMENTI[p.stato], livello: p.livello ?? p.stato },
    });
    await prisma.passaggioStato.create({
      data: { partnerId: p.id, da: p.stato, a: SPOSTAMENTI[p.stato], origine: "migrazione-livello" },
    });
    fatte++;
    if (fatte % 25 === 0) console.log(`  …${fatte}/${partner.length}`);
  }
  console.log(`\nFatto: ${fatte} anagrafiche migrate.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

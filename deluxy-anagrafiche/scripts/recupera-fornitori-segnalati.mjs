// Recupero 24/08/2026 — chi è GIÀ arrivato dall'app di ricerca fornitori
// diventa fornitore «segnalato».
//
// La regola automatica (POST /api/v1/partners: sorgente ricerca fornitori →
// statoFornitore = "segnalato" se vuoto) vale solo dalle scritture nuove in
// avanti. Le anagrafiche mandate da quell'app PRIMA della regola avevano il
// campo vuoto: questo script le allinea, così l'elenco dei fornitori segnalati
// parte completo e non solo da oggi.
//
// Chi viene toccato: anagrafiche ATTIVE con statoFornitore VUOTO la cui
// `fonte` — o il `sistema` di un riferimento esterno — è l'app di ricerca
// fornitori (stesso riconoscimento di `eRicercaFornitori` in
// src/lib/interessi.ts: supplier / fornitor / search…). I record archiviati
// (le anagrafiche di prova) si saltano; chi ha già uno stato fornitore
// (abituale, da evitare…) NON viene degradato.
//
//   node scripts/recupera-fornitori-segnalati.mjs --prova   → elenca e non scrive
//   node scripts/recupera-fornitori-segnalati.mjs           → esegue
//
// È rieseguibile: dopo il primo giro non trova più niente da marcare.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const prova = process.argv.includes("--prova");

// Stessa regola di eRicercaFornitori (src/lib/interessi.ts): tenerle allineate.
function eRicercaFornitori(sistema) {
  const s = sistema.trim().toLowerCase().replace(/^deluxy-/, "");
  return s.includes("supplier") || s.includes("fornitor") || s === "search" || s.startsWith("search-");
}

async function main() {
  const candidate = await prisma.partner.findMany({
    where: { attivo: true, statoFornitore: null },
    select: {
      id: true,
      nome: true,
      citta: true,
      fonte: true,
      riferimenti: { select: { sistema: true } },
    },
    orderBy: { nome: "asc" },
  });

  const daMarcare = candidate.filter(
    (p) => eRicercaFornitori(p.fonte) || p.riferimenti.some((r) => eRicercaFornitori(r.sistema)),
  );

  console.log(`Da marcare «segnalato»: ${daMarcare.length} anagrafiche vive`);
  for (const p of daMarcare) {
    console.log(`  - ${p.nome} · ${p.citta ?? "—"} · fonte ${p.fonte}`);
  }
  if (prova) {
    console.log("\n--prova: nessuna scrittura.");
    return;
  }
  if (daMarcare.length === 0) return;

  const ids = daMarcare.map((p) => p.id);
  await prisma.partner.updateMany({
    where: { id: { in: ids } },
    data: { statoFornitore: "segnalato" },
  });
  // Nello storico come recupero, non come decisione di qualcuno: sulla scheda
  // si legge «Fornitore: Segnalato · recupero-segnalati».
  await prisma.passaggioStato.createMany({
    data: ids.map((partnerId) => ({
      partnerId,
      da: "for:",
      a: "for:segnalato",
      origine: "recupero-segnalati",
    })),
  });
  console.log(`\nFatto: ${daMarcare.length} marcate «segnalato», passaggi scritti nello storico.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

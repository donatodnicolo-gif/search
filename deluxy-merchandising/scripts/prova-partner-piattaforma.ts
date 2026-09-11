// **Che cosa sa la piattaforma dei partner dei nostri prodotti in attesa.**
//
// 11/09/2026. Prova di sola lettura per `leggiPartnerDallaPiattaforma()`: dice
// quanti partner risponde la piattaforma e, per ogni prodotto in attesa di
// approvazione, che cosa si potrebbe riempire dei campi del negozio che parlano
// del partner (indirizzo, città, province).
//
// Uso: npx tsx scripts/prova-partner-piattaforma.ts

import { prisma } from "../src/lib/db";
import { leggiPartnerDallaPiattaforma } from "../src/lib/piattaforma";

async function main() {
  const esito = await leggiPartnerDallaPiattaforma();
  if (!esito.ok) {
    console.error("❌ " + esito.messaggio);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`Partner attivi sulla piattaforma: ${esito.partner.length}`);
  for (const p of esito.partner.slice(0, 5)) {
    console.log(`  ${p.insegna} · ${p.citta || "(senza città)"} · province: ${(p.province ?? []).join(",") || "—"}`);
  }

  const prodotti = await prisma.prodotto.findMany({
    where: { fase: "attesa_approvazione" },
    select: { nome: true, codice: true, partnerPiattaformaId: true, partnerInsegna: true },
    orderBy: { creatoIl: "asc" },
  });
  console.log(`\nProdotti in attesa: ${prodotti.length}`);
  const perId = new Map(esito.partner.map((p) => [p.id, p]));
  for (const x of prodotti) {
    const p = x.partnerPiattaformaId ? perId.get(x.partnerPiattaformaId) : undefined;
    if (!p) {
      console.log(`  ${x.nome}: partner «${x.partnerInsegna ?? "—"}» non trovato fra quelli attivi di là`);
      continue;
    }
    console.log(`  ${x.nome}: ${p.insegna} · indirizzo «${p.citta || "—"}» · province ${(p.province ?? []).join(",") || "—"}`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

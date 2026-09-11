// **La prova che il collegamento con l'app delivery legge davvero.**
//
// L'11/09/2026 l'utente ha configurato indirizzo e chiave della piattaforma
// consegne («collegamento con app delivery su merchandising con chiave
// creato»). Fino a quel momento il tasto «⟲ Recupera dalla piattaforma»
// rispondeva «non configurata» e non si poteva sapere se il resto funzionasse.
//
// Questo script usa **le stesse funzioni del tasto** (`leggiProdottoDallaPiattaforma`),
// non una copia: se passa qui, il tasto fa la stessa cosa. Non scrive niente:
// dice solo che cosa la piattaforma restituisce per ogni prodotto del partner
// che abbiamo in coda, e quali dei nostri campi vuoti si riempirebbero.
//
// Uso: npx tsx scripts/prova-lettura-piattaforma.ts

import { prisma } from "../src/lib/db";
import { leggiProdottoDallaPiattaforma } from "../src/lib/piattaforma";
import { daPiattaforma } from "../src/lib/prodotti-dal-partner";

async function main() {
  const prodotti = await prisma.prodotto.findMany({
    where: { fase: "attesa_approvazione" },
    select: {
      id: true, nome: true, codice: true, origine: true, idEsterno: true,
      prezzoVendita: true, costoProduzione: true, prezzoPartner: true,
      partnerPiattaformaId: true, partnerInsegna: true,
      varianti: { select: { id: true, nome: true, sku: true } },
    },
    orderBy: { creatoIl: "asc" },
  });

  console.log(`Prodotti in attesa di approvazione: ${prodotti.length}\n`);

  for (const p of prodotti) {
    console.log("─".repeat(70));
    console.log(`${p.nome}  (${p.codice})  origine=${p.origine}`);
    if (!daPiattaforma(p.origine)) {
      console.log("  non viene dalla piattaforma: saltato.");
      continue;
    }
    const esito = await leggiProdottoDallaPiattaforma(p.codice, p.idEsterno);
    if (!esito.ok) {
      console.log(`  ❌ ${esito.messaggio}`);
      continue;
    }
    const d = esito.prodotto;
    console.log(`  ✅ trovato di là: «${d.nome}»  id=${d.id}`);
    console.log(`     partner: ${d.partner || "(vuoto)"}   partnerId: ${d.partnerId || "(vuoto)"}`);
    console.log(`     prezzo al partner: ${d.prezzo ?? "—"}   prezzo pubblico: ${d.prezzoPubblico ?? "—"}   tipologia: ${d.tipologia ?? "—"}`);
    console.log(`     varianti di là: ${d.varianti.length}`);
    for (const v of d.varianti) {
      console.log(`       · ${v.nome}  sku=${v.sku || "—"}  partner=${v.prezzo ?? "—"}  pubblico=${v.prezzoPubblico ?? "—"}`);
    }

    // Che cosa si riempirebbe davvero: il tasto tocca **solo i campi vuoti**.
    const riempirebbe: string[] = [];
    if (!p.partnerPiattaformaId && d.partnerId) riempirebbe.push("id del partner");
    if (!p.partnerInsegna && d.partner) riempirebbe.push(`insegna «${d.partner}»`);
    if (!p.prezzoVendita && d.prezzoPubblico) riempirebbe.push(`prezzo pubblico ${d.prezzoPubblico} €`);
    if (!p.costoProduzione && d.prezzo) riempirebbe.push(`costo ${d.prezzo} €`);
    if (!p.prezzoPartner && d.prezzo) riempirebbe.push(`prezzo al partner ${d.prezzo} €`);
    const nomiQui = new Set(p.varianti.map((v) => v.nome.trim().toLowerCase()));
    const nuove = d.varianti.filter((v) => !nomiQui.has(v.nome.trim().toLowerCase()));
    if (nuove.length) riempirebbe.push(`${nuove.length} varianti nuove`);
    console.log(`     → il tasto riempirebbe: ${riempirebbe.length ? riempirebbe.join(", ") : "niente (qui c'è già tutto)"}`);
  }

  console.log("─".repeat(70));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

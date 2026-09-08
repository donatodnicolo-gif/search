// **I due stati devono dire la stessa cosa.**
//
// Segnalato dall'utente l'08/09/2026 guardando una scheda: «perché qui dice
// bozza?» — su «Back to Office Aperitif» il badge diceva **«Bozza su Shopify»**
// mentre accanto c'era **«Business Deluxy · attivo»**. Due badge sulla stessa
// riga che si contraddicevano, perché leggono due campi diversi:
//
//   · `statoShopify`  = la parola di Shopify (ACTIVE | DRAFT | ARCHIVED),
//     riscritta a ogni import notturno;
//   · `shopifyStato`  = la nostra (pubblicato | bozza | non_pubblicato), che
//     l'import aggiornava **solo alla creazione** della scheda e mai dopo.
//
// Misurati: **728 prodotti su 3.665 in disaccordo**, e i più pericolosi erano
// gli 85 che l'app dava per **pubblicati** mentre sul negozio erano in bozza o
// archiviati — cioè un'app che dice «è in vendita» di qualcosa che il cliente
// non vede.
//
// ⚠️ Comanda il negozio, non noi. Non è la regola di sempre — `fase` resta un
// giudizio nostro che l'import non sovrascrive — ma questi due campi non sono
// un giudizio: **sono lo stesso fatto scritto due volte**, e quando due copie
// dello stesso fatto divergono vince quella letta dalla fonte.
//
// La causa è chiusa in `src/lib/shopify-collezioni.ts` (l'import ora scrive
// tutti e due); questo script sana il pregresso.
//
//   npx tsx scripts/allinea-stati-shopify.ts            # prova, non scrive
//   npx tsx scripts/allinea-stati-shopify.ts --applica

import { caricaEnv } from "./vecchio-gestionale";

const NOSTRA_PAROLA: Record<string, string> = { ACTIVE: "pubblicato", DRAFT: "bozza", ARCHIVED: "non_pubblicato" };

async function main() {
  caricaEnv();
  const { prisma } = await import("../src/lib/db");
  const applica = process.argv.includes("--applica");

  const righe = await prisma.prodotto.findMany({
    where: { shopifyId: { not: null }, statoShopify: { not: null } },
    select: { id: true, codice: true, nome: true, shopifyStato: true, statoShopify: true },
  });

  const daFare = righe.filter((r) => {
    const atteso = NOSTRA_PAROLA[r.statoShopify ?? ""];
    return atteso && r.shopifyStato !== atteso;
  });

  const combo = new Map<string, number>();
  for (const r of daFare) {
    const k = `${r.statoShopify} sul negozio → «${r.shopifyStato}» da noi`;
    combo.set(k, (combo.get(k) ?? 0) + 1);
  }

  console.log(`Prodotti con uno stato letto dal negozio: ${righe.length}`);
  console.log(`IN DISACCORDO: ${daFare.length}\n`);
  for (const [k, v] of [...combo.entries()].sort((a, b) => b[1] - a[1])) {
    const grave = k.startsWith("DRAFT") || k.startsWith("ARCHIVED") ? "  ⚠️ l'app lo dava per pubblicato" : "";
    console.log(`  ${String(v).padStart(5)}  ${k}${k.includes("«pubblicato»") ? grave : ""}`);
  }

  const esempi = daFare.slice(0, 6);
  if (esempi.length) {
    console.log("\n  esempi:");
    for (const r of esempi) console.log(`   ${(r.codice ?? "").padEnd(14)} ${r.nome.slice(0, 32).padEnd(32)} «${r.shopifyStato}» → «${NOSTRA_PAROLA[r.statoShopify ?? ""]}»`);
  }

  if (!applica) { console.log("\nProva: niente scritto. Rilancia con --applica."); await prisma.$disconnect(); return; }

  // ⚠️ Tre `UPDATE`, uno per stato, invece di 728 giri sul pooler condiviso.
  let n = 0;
  for (const [stato, parola] of Object.entries(NOSTRA_PAROLA)) {
    const fatti = await prisma.prodotto.updateMany({
      where: { shopifyId: { not: null }, statoShopify: stato, shopifyStato: { not: parola } },
      data: { shopifyStato: parola },
    });
    console.log(`  ${stato} → «${parola}»: ${fatti.count}`);
    n += fatti.count;
  }
  console.log(`\nAllineati ${n} prodotti (attesi ${daFare.length}).`);

  const restano = (await prisma.prodotto.findMany({
    where: { shopifyId: { not: null }, statoShopify: { not: null } },
    select: { shopifyStato: true, statoShopify: true },
  })).filter((r) => { const a = NOSTRA_PAROLA[r.statoShopify ?? ""]; return a && r.shopifyStato !== a; }).length;
  console.log(`Rileggendo: ${restano} ancora in disaccordo.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

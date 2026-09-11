// **Un prodotto è davvero visibile sul sito, o solo «attivo» nell'admin?**
//
// 11/09/2026, segnalazione dell'utente: «mi dice pubblicato ma su Shopify
// deluxy.it non lo trovo». Sono due cose diverse e si confondono facilmente:
// un prodotto può essere **ACTIVE** e non essere **pubblicato sul canale**
// «Online Store» — nell'admin c'è, sulla vetrina no. Questo script chiede a
// Shopify tutti e due i dati, senza scrivere niente.
//
// Uso: npx tsx scripts/controlla-pubblicazione.ts <id-prodotto-merchandising>

import { prisma } from "../src/lib/db";
import { tokenDi } from "../src/lib/negozi";

const QUERY = `
  query($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      onlineStoreUrl
      onlineStorePreviewUrl
      publishedAt
      totalInventory
      tracksInventory
      variants(first: 10) { nodes { sku title availableForSale inventoryQuantity inventoryPolicy } }
    }
  }
`;

async function main() {
  const id = process.argv[2];
  if (!id) { console.error("Serve l'id del prodotto in Merchandising."); process.exit(1); }
  const p = await prisma.prodotto.findUnique({
    where: { id },
    select: { nome: true, codice: true, shopifyId: true, negozioNome: true, statoShopify: true, handleShopify: true,
      pubblicazioni: { select: { negozio: true, shopifyId: true, handle: true, statoShopify: true } } },
  });
  if (!p) { console.error("Prodotto non trovato."); process.exit(1); }
  console.log(`${p.nome} (${p.codice})\n`);

  const negozi = await prisma.negozioShopify.findMany({ select: { id: true, nome: true, dominio: true, canaleVendite: true } });
  const righe = p.pubblicazioni.length
    ? p.pubblicazioni.map((r) => ({ negozio: r.negozio, shopifyId: r.shopifyId }))
    : [{ negozio: p.negozioNome ?? "", shopifyId: p.shopifyId }];

  for (const r of righe) {
    if (!r.shopifyId) continue;
    const n = negozi.find((x) => x.nome === r.negozio);
    if (!n) { console.log(`${r.negozio}: negozio sconosciuto qui.`); continue; }
    const token = await tokenDi(n.id).catch(() => null);
    if (!token) { console.log(`${r.negozio}: non so autenticarmi.`); continue; }
    const res = await fetch(`https://${token.dominio}/admin/api/2025-10/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token.token },
      body: JSON.stringify({ query: QUERY, variables: { id: r.shopifyId } }),
    });
    const corpo = (await res.json()) as { data?: { product?: Record<string, unknown> }; errors?: unknown };
    const prod = corpo?.data?.product as Record<string, any> | undefined;
    console.log(`── ${r.negozio}  (${n.canaleVendite ?? n.dominio})`);
    if (!prod) { console.log(`   Shopify non lo trova. Risposta: ${JSON.stringify(corpo).slice(0, 300)}`); continue; }
    console.log(`   stato admin:        ${prod.status}`);
    console.log(`   pubblicato il:      ${prod.publishedAt ?? "MAI (non è sul canale del negozio online)"}`);
    console.log(`   indirizzo pubblico: ${prod.onlineStoreUrl ?? "— nessuno: la vetrina non lo espone —"}`);
    console.log(`   anteprima:          ${prod.onlineStorePreviewUrl ?? "—"}`);
    console.log(`   giacenza totale:    ${prod.totalInventory} (controllo scorte: ${prod.tracksInventory})`);
    for (const v of prod.variants?.nodes ?? []) {
      console.log(`     · ${v.title} sku=${v.sku || "—"} acquistabile=${v.availableForSale} giacenza=${v.inventoryQuantity} politica=${v.inventoryPolicy}`);
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

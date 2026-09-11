// **Quanti prodotti pubblicati dal modulo NON sono sulla vetrina.**
//
// 11/09/2026, segnalazione dell'utente: «mi dice pubblicato ma su Shopify
// deluxy.it non lo trovo». Su Gifts, Flowers e Cake il nostro token non ha
// `read_publications` / `write_publications`: un prodotto creato dall'app nasce
// **ACTIVE nell'admin** ma nessuno lo mette sul canale «Online Store», e il
// cliente non lo vede. Questo script conta il danno, senza scrivere niente.
//
// Uso: npx tsx scripts/conta-non-in-vetrina.ts

import { prisma } from "../src/lib/db";
import { tokenDi } from "../src/lib/negozi";

async function main() {
  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true }, select: { id: true, nome: true, canaleVendite: true } });
  // I prodotti che il MODULO ha messo sul negozio (non quelli importati).
  const righe = await prisma.pubblicazioneNegozio.findMany({
    where: { origine: "modulo", shopifyId: { not: null }, statoShopify: "ACTIVE" },
    select: { negozio: true, shopifyId: true, prodotto: { select: { nome: true, codice: true } } },
  });
  console.log(`Schede messe sul negozio dal modulo e ACTIVE: ${righe.length}\n`);

  const perNegozio = new Map<string, typeof righe>();
  for (const r of righe) perNegozio.set(r.negozio, [...(perNegozio.get(r.negozio) ?? []), r]);

  for (const [nome, elenco] of perNegozio) {
    const n = negozi.find((x) => x.nome === nome);
    if (!n) continue;
    const token = await tokenDi(n.id).catch(() => null);
    if (!token) { console.log(`${nome}: non so autenticarmi.`); continue; }
    let inVetrina = 0, fuori = 0;
    const nomiFuori: string[] = [];
    for (const r of elenco) {
      const res = await fetch(`https://${token.dominio}/admin/api/2025-10/graphql.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token.token },
        body: JSON.stringify({ query: `query($id: ID!) { product(id: $id) { publishedAt onlineStoreUrl } }`, variables: { id: r.shopifyId } }),
      });
      const c = (await res.json()) as { data?: { product?: { publishedAt: string | null; onlineStoreUrl: string | null } } };
      const p = c?.data?.product;
      if (p?.publishedAt) inVetrina++;
      else { fuori++; if (nomiFuori.length < 12) nomiFuori.push(`${r.prodotto.nome} (${r.prodotto.codice})`); }
    }
    console.log(`${nome} (${n.canaleVendite ?? ""}): ${elenco.length} schede · in vetrina ${inVetrina} · FUORI VETRINA ${fuori}`);
    for (const x of nomiFuori) console.log(`   · ${x}`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

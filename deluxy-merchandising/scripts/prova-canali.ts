// **I canali di vendita di ogni negozio: li possiamo leggere? possiamo pubblicare?**
//
// 11/09/2026. Un prodotto ACTIVE non è per forza sulla vetrina: deve essere
// anche **pubblicato sul canale «Online Store»**. Questo script chiede a ogni
// negozio l'elenco dei canali e dice se il nostro token ha il permesso di
// leggerli. Non scrive niente.
//
// Uso: npx tsx scripts/prova-canali.ts

import { prisma } from "../src/lib/db";
import { tokenDi } from "../src/lib/negozi";

async function main() {
  const negozi = await prisma.negozioShopify.findMany({ where: { attivo: true }, select: { id: true, nome: true, canaleVendite: true } });
  for (const n of negozi) {
    const token = await tokenDi(n.id).catch(() => null);
    if (!token) { console.log(`${n.nome}: non so autenticarmi.`); continue; }
    const res = await fetch(`https://${token.dominio}/admin/api/2025-10/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token.token },
      body: JSON.stringify({ query: `query { publications(first: 20) { nodes { id name } } }` }),
    });
    const corpo = (await res.json()) as { data?: { publications?: { nodes: { id: string; name: string }[] } }; errors?: unknown };
    const nodi = corpo?.data?.publications?.nodes;
    if (!nodi) {
      const msg = JSON.stringify(corpo?.errors ?? corpo).slice(0, 220);
      console.log(`${n.nome.padEnd(16)} ❌ non posso leggere i canali: ${msg}`);
      continue;
    }
    console.log(`${n.nome.padEnd(16)} ✅ ${nodi.length} canali: ${nodi.map((x) => x.name).join(", ")}`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

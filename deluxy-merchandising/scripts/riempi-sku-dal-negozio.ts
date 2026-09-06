// (npx tsx scripts/riempi-sku-dal-negozio.ts) Seconda passata SOLO sul database: per ogni variante senza sku di una scheda
// ACTIVE, rilegge il prodotto sul negozio che possiede quel gid e copia lo SKU
// della variante con lo stesso nome. Non scrive su Shopify.
import { readFileSync } from "node:fs";
const vuoto = (s: string | null | undefined) => !s || s.trim() === "";
async function main() {
  for (const line of readFileSync("./.env", "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (!m) continue; let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1); if (process.env[m[1]] === undefined) process.env[m[1]] = v; }
  const { negoziAttivi } = await import("../src/lib/negozi");
  const { graphqlNegozio } = await import("../src/lib/shopify-scrittura");
  const { prisma } = await import("../src/lib/db");
  const negozi = await negoziAttivi();
  const schede = await prisma.prodotto.findMany({
    where: { statoShopify: "ACTIVE", shopifyId: { not: null }, varianti: { some: { OR: [{ sku: null }, { sku: "" }] } } },
    select: { id: true, nome: true, shopifyId: true, varianti: { select: { id: true, nome: true, sku: true } } },
  });
  const presi = new Set((await prisma.variante.findMany({ select: { sku: true } })).map((v) => (v.sku ?? "").toLowerCase()).filter(Boolean));
  console.log(`schede ACTIVE con varianti senza sku: ${schede.length}`);
  let ok = 0, nonTrovate = 0, giaPresi = 0, senzaNegozio = 0;
  const dettagli: string[] = [];
  for (const s of schede) {
    type Nodo = { variants: { nodes: { sku: string | null; title: string }[] } };
    let nodo: Nodo | null = null;
    for (const n of negozi) {
      const r = await graphqlNegozio(n.dominio, n.token, `query($id:ID!){ node(id:$id){ ... on Product { variants(first:100){ nodes{ sku title } } } } }`, { id: s.shopifyId });
      const d = (r.corpo.data as { node?: Nodo | null } | undefined)?.node;
      if (d && d.variants) { nodo = d; break; }
    }
    if (!nodo) { senzaNegozio++; dettagli.push(`nessun negozio risponde per ${s.nome} (${s.shopifyId})`); continue; }
    const perNome = new Map(nodo.variants.nodes.map((v) => [v.title === "Default Title" ? "Unica" : v.title, v.sku]));
    for (const v of s.varianti) {
      if (!vuoto(v.sku)) continue;
      const sku = perNome.get(v.nome);
      if (vuoto(sku)) { nonTrovate++; dettagli.push(`${s.nome} · ${v.nome}: nessuna variante con quel nome sul negozio`); continue; }
      if (presi.has(sku!.toLowerCase())) { giaPresi++; dettagli.push(`${s.nome} · ${v.nome}: sku ${sku} già usato da un'altra variante qui`); continue; }
      await prisma.variante.update({ where: { id: v.id }, data: { sku: sku!.trim() } });
      presi.add(sku!.toLowerCase());
      ok++;
    }
  }
  console.log(`aggiornate ${ok}, senza corrispondenza ${nonTrovate}, sku già preso ${giaPresi}, gid senza negozio ${senzaNegozio}`);
  for (const d of dettagli.slice(0, 40)) console.log("  -", d);
  const restano = await prisma.variante.count({ where: { prodotto: { statoShopify: "ACTIVE" }, OR: [{ sku: null }, { sku: "" }] } });
  console.log(`varianti ACTIVE senza sku ora: ${restano}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

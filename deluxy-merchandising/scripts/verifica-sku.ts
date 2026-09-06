// Verifica che **ogni prodotto pubblicato** (ACTIVE) sui negozi Shopify abbia
// lo SKU su tutte le varianti, e che qui a catalogo lo stesso prodotto lo
// riporti (Prodotto.codice o Variante.sku). Non scrive niente: legge i negozi
// con i token dell'app e il database, e stampa un rapporto + un JSON.
//
//   (dalla cartella deluxy-merchandising)
//   npx tsx scripts/verifica-sku.ts             # tutti i negozi attivi
//   npx tsx scripts/verifica-sku.ts Cake        # uno solo
//
// Carica .env a mano (tsx non lo fa) PRIMA di importare i moduli che usano
// Prisma. Niente top-level await: il progetto è CJS.

import { readFileSync, writeFileSync } from "node:fs";

type VarianteApi = { id: string; sku: string | null; title: string };
type ProdottoApi = {
  id: string;
  title: string;
  handle: string;
  status: string;
  variants: { nodes: VarianteApi[] };
};

const QUERY = `
  query ($cursor: String) {
    products(first: 30, after: $cursor, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title handle status
        variants(first: 20) { nodes { id sku title } }
      }
    }
  }`;

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  for (const line of readFileSync("./.env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }

  const { negoziAttivi } = await import("../src/lib/negozi");
  const { graphqlNegozio } = await import("../src/lib/shopify-scrittura");
  const { prisma } = await import("../src/lib/db");

  const tutti = await negoziAttivi();
  const scelti = process.argv.slice(2).map((s) => s.toLowerCase());
  const negozi = scelti.length ? tutti.filter((n) => scelti.includes(n.nome.toLowerCase())) : tutti;
  if (negozi.length === 0) throw new Error("Nessun negozio attivo (o nessuno col nome chiesto).");

  const rapporto: Record<string, unknown> = {};

  for (const n of negozi) {
    const prodotti: ProdottoApi[] = [];
    let cursor: string | null = null;
    let pagine = 0;
    for (;;) {
      const r = await graphqlNegozio(n.dominio, n.token, QUERY, { cursor });
      const errori = r.corpo.errors?.map((e) => e.message) ?? [];
      if (r.status === 429 || errori.some((e) => /throttl/i.test(e))) {
        await attendi(2500);
        continue;
      }
      if (errori.length || r.status !== 200) throw new Error(`${n.nome}: HTTP ${r.status} ${errori.join("; ")}`);
      const dati = r.corpo.data?.products as unknown as { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: ProdottoApi[] };
      prodotti.push(...dati.nodes);
      pagine++;
      if (!dati.pageInfo.hasNextPage) break;
      cursor = dati.pageInfo.endCursor;
      await attendi(300);
    }

    // Chi ha 20 varianti o più potrebbe averne oltre la pagina: si rilegge per
    // intero, a 5 per chiamata (5 × 102 punti), altrimenti i «senza SKU» delle
    // torte di laurea con 27-48 varianti uscirebbero contati per difetto.
    const troncati = prodotti.filter((p) => p.variants.nodes.length >= 20);
    for (let i = 0; i < troncati.length; i += 5) {
      const ids = troncati.slice(i, i + 5).map((p) => p.id);
      const r = await graphqlNegozio(n.dominio, n.token, `query($ids:[ID!]!){ nodes(ids:$ids){ ... on Product { id variants(first:100){ nodes{ id sku title } } } } }`, { ids });
      const errori = r.corpo.errors?.map((e) => e.message) ?? [];
      if (r.status === 429 || errori.some((e) => /throttl/i.test(e))) { await attendi(2500); i -= 5; continue; }
      if (errori.length || r.status !== 200) throw new Error(`${n.nome}: rilettura varianti HTTP ${r.status} ${errori.join("; ")}`);
      for (const nodo of (r.corpo.data as unknown as { nodes: ({ id: string; variants: { nodes: VarianteApi[] } } | null)[] }).nodes) {
        if (!nodo) continue;
        const p = prodotti.find((x) => x.id === nodo.id);
        if (p) p.variants.nodes = nodo.variants.nodes;
      }
      await attendi(300);
    }

    // Lato negozio
    const vuoto = (s: string | null) => !s || s.trim() === "";
    const senzaSkuNegozio = prodotti
      .filter((p) => p.variants.nodes.some((v) => vuoto(v.sku)))
      .map((p) => ({
        id: p.id,
        titolo: p.title,
        handle: p.handle,
        varianti: p.variants.nodes.length,
        variantiSenzaSku: p.variants.nodes.filter((v) => vuoto(v.sku)).map((v) => v.title),
      }));
    const variantiTot = prodotti.reduce((a, p) => a + p.variants.nodes.length, 0);
    const variantiSenzaSku = prodotti.reduce((a, p) => a + p.variants.nodes.filter((v) => vuoto(v.sku)).length, 0);
    const conVarOltre20 = prodotti.filter((p) => p.variants.nodes.length >= 20).map((p) => p.title);
    // L'import legge `variants(first: 10)`: oltre la decima, qui non esistono.
    const conPiuDi10Varianti = prodotti.filter((p) => p.variants.nodes.length > 10).length;
    const variantiOltreLaDecima = prodotti.reduce((a, p) => a + Math.max(0, p.variants.nodes.length - 10), 0);

    // SKU duplicati sul negozio (stesso SKU su prodotti diversi)
    const perSku = new Map<string, string[]>();
    for (const p of prodotti) for (const v of p.variants.nodes) {
      if (vuoto(v.sku)) continue;
      const k = v.sku!.trim();
      perSku.set(k, [...(perSku.get(k) ?? []), p.title]);
    }
    const skuDuplicati = [...perSku.entries()].filter(([, t]) => new Set(t).size > 1).map(([sku, t]) => ({ sku, prodotti: [...new Set(t)] }));

    // Lato database: prodotto per shopifyId
    const gid = prodotti.map((p) => p.id);
    const inDb = await prisma.prodotto.findMany({
      where: { shopifyId: { in: gid } },
      select: { id: true, codice: true, nome: true, shopifyId: true, statoShopify: true, fase: true, varianti: { select: { sku: true, nome: true } } },
    });
    const dbPerGid = new Map(inDb.map((p) => [p.shopifyId!, p]));
    const nonACatalogo = prodotti.filter((p) => !dbPerGid.has(p.id)).map((p) => ({ id: p.id, titolo: p.title, handle: p.handle }));
    const statoDiverso = inDb.filter((p) => p.statoShopify !== "ACTIVE").map((p) => ({ codice: p.codice, nome: p.nome, statoShopify: p.statoShopify }));

    // Il prodotto qui «ha lo SKU» se il suo codice è uno SKU del negozio o la
    // base comune degli SKU (ICQLBN-1, ICQLBN-2 → ICQLBN), oppure se ogni
    // variante del negozio con SKU ha una Variante qui con lo stesso sku.
    const dbSenzaSku: { codice: string; nome: string; skuNegozio: string[]; skuVariantiQui: (string | null)[] }[] = [];
    let dbAllineati = 0;
    for (const p of prodotti) {
      const d = dbPerGid.get(p.id);
      if (!d) continue;
      const skus = p.variants.nodes.map((v) => (v.sku ?? "").trim()).filter(Boolean);
      if (skus.length === 0) continue; // già conteggiato lato negozio
      const basi = new Set(skus.map((s) => s.replace(/-\d+$/, "")));
      const codiceOk =
        skus.some((s) => s.toLowerCase() === d.codice.toLowerCase()) ||
        (basi.size === 1 && [...basi][0].toLowerCase() === d.codice.toLowerCase());
      const skuQui = new Set(d.varianti.map((v) => (v.sku ?? "").trim().toLowerCase()).filter(Boolean));
      const variantiOk = skus.every((s) => skuQui.has(s.toLowerCase()));
      if (codiceOk || variantiOk) dbAllineati++;
      else dbSenzaSku.push({ codice: d.codice, nome: d.nome, skuNegozio: skus, skuVariantiQui: d.varianti.map((v) => v.sku) });
    }

    rapporto[n.nome] = {
      dominio: n.dominio,
      pagine,
      negozio: {
        prodottiAttivi: prodotti.length,
        varianti: variantiTot,
        variantiSenzaSku,
        prodottiConVariantiSenzaSku: senzaSkuNegozio.length,
        elencoSenzaSku: senzaSkuNegozio,
        skuDuplicati,
        prodottiCon20VariantiOPiu: conVarOltre20,
        prodottiConPiuDi10Varianti: conPiuDi10Varianti,
        variantiOltreLaDecima,
      },
      database: {
        prodottiTrovatiPerShopifyId: inDb.length,
        nonACatalogo,
        statoShopifyNonActive: statoDiverso,
        allineatiSulloSku: dbAllineati,
        senzaSkuCorrispondente: dbSenzaSku,
      },
    };

    const r = rapporto[n.nome] as { negozio: Record<string, unknown>; database: Record<string, unknown> };
    console.log(`\n=== ${n.nome} (${n.dominio}) — ${pagine} pagine`);
    console.log(`  Negozio: ${prodotti.length} prodotti attivi, ${variantiTot} varianti, ${variantiSenzaSku} varianti senza SKU su ${senzaSkuNegozio.length} prodotti; SKU duplicati: ${skuDuplicati.length}; prodotti con ≥20 varianti (riletti per intero): ${conVarOltre20.length}; con più di 10 varianti: ${conPiuDi10Varianti} (${variantiOltreLaDecima} varianti oltre la decima, che l'import non legge)`);
    console.log(`  Database: ${inDb.length} trovati per shopifyId, ${nonACatalogo.length} non a catalogo, ${statoDiverso.length} con statoShopify ≠ ACTIVE, ${dbAllineati} allineati sullo SKU, ${dbSenzaSku.length} senza SKU corrispondente`);
    void r;
  }

  // Lato database, senza passare dal negozio: varianti senza sku fra i prodotti in scena.
  const inScena = await prisma.prodotto.count({ where: { statoShopify: "ACTIVE" } });
  const variantiInScena = await prisma.variante.count({ where: { prodotto: { statoShopify: "ACTIVE" } } });
  const variantiSenzaSkuDb = await prisma.variante.count({ where: { prodotto: { statoShopify: "ACTIVE" }, OR: [{ sku: null }, { sku: "" }] } });
  const prodottiSenzaVarianti = await prisma.prodotto.count({ where: { statoShopify: "ACTIVE", varianti: { none: {} } } });
  rapporto.database = { prodottiActive: inScena, variantiDeiProdottiActive: variantiInScena, variantiSenzaSku: variantiSenzaSkuDb, prodottiActiveSenzaVarianti: prodottiSenzaVarianti };
  console.log(`\n=== Database (statoShopify = ACTIVE): ${inScena} prodotti, ${variantiInScena} varianti di cui ${variantiSenzaSkuDb} senza sku; ${prodottiSenzaVarianti} prodotti senza alcuna variante qui`);

  const uscita = process.env.VERIFICA_SKU_OUT ?? "./verifica-sku.json";
  writeFileSync(uscita, JSON.stringify(rapporto, null, 2));
  console.log(`\nRapporto scritto in ${uscita}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

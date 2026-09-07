// **Campione di prodotti per studiare come i negozi scrivono le descrizioni**
// (07/09/2026). Per ogni negozio attivo legge i prodotti ACTIVE e ne tiene
// fino a 6 per tipo prodotto (massimo 60 per negozio), con descrizione HTML
// completa, metafield, opzioni, tag, categoria, SEO, prime varianti; più le
// definizioni dei metafield e il dominio pubblico del negozio. **Non scrive
// niente** sul negozio né sul database: salva un JSON per negozio nella
// cartella passata come primo argomento (default: docs/campione-descrizioni).
//
//   npx tsx scripts/campione-descrizioni.ts <cartella> [negozio…]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

const QUERY = `
  query ($cursor: String) {
    products(first: 20, after: $cursor, query: "status:active", sortKey: UPDATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title handle productType vendor tags status descriptionHtml createdAt updatedAt publishedAt templateSuffix
        category { id name fullName }
        seo { title description }
        featuredImage { url altText }
        images(first: 6) { nodes { url altText } }
        options { name optionValues { name } }
        variants(first: 12) { nodes { title sku price compareAtPrice } }
        metafields(first: 60) { nodes { namespace key type value } }
      }
    }
  }`;

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

  const cartella = process.argv[2] || "docs/campione-descrizioni";
  mkdirSync(cartella, { recursive: true });
  const tutti = await negoziAttivi();
  const scelti = process.argv.slice(3).map((s) => s.toLowerCase());
  const negozi = scelti.length ? tutti.filter((n) => scelti.includes(n.nome.toLowerCase())) : tutti;

  for (const n of negozi) {
    const chiama = async (q: string, v: Record<string, unknown>) => {
      for (let t = 0; t < 8; t++) {
        const r = await graphqlNegozio(n.dominio, n.token, q, v);
        const errori = r.corpo.errors?.map((e) => e.message) ?? [];
        if (r.status === 429 || errori.some((e) => /throttl/i.test(e))) { await attendi(3000); continue; }
        if (errori.length || r.status !== 200) throw new Error(`${n.nome}: HTTP ${r.status} ${errori.join("; ")}`);
        return r.corpo.data as Record<string, unknown>;
      }
      throw new Error(`${n.nome}: limite di richieste`);
    };

    const shop = (await chiama(`{ shop { name primaryDomain { url } currencyCode } }`, {})) as { shop: { name: string; primaryDomain: { url: string }; currencyCode: string } };
    const defs = (await chiama(`{ metafieldDefinitions(first: 100, ownerType: PRODUCT) { nodes { namespace key name type { name } description validations { name value } } } }`, {})) as { metafieldDefinitions: { nodes: unknown[] } };

    type P = { productType: string | null; [k: string]: unknown };
    const perTipo = new Map<string, P[]>();
    let totale = 0;
    let cursor: string | null = null;
    for (let pagina = 0; pagina < 40; pagina++) {
      const d = (await chiama(QUERY, { cursor })) as { products: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: P[] } };
      for (const p of d.products.nodes) {
        totale++;
        const tipo = (p.productType as string | null)?.trim() || "(senza tipo)";
        const lista = perTipo.get(tipo) ?? [];
        if (lista.length < 6) lista.push(p);
        perTipo.set(tipo, lista);
      }
      if (!d.products.pageInfo.hasNextPage) break;
      cursor = d.products.pageInfo.endCursor;
      await attendi(400);
    }
    let campione = [...perTipo.values()].flat();
    if (campione.length > 60) {
      // Si tengono tutti i tipi ma meno esemplari per tipo, finché si sta in 60.
      for (let k = 5; k >= 1 && campione.length > 60; k--) campione = [...perTipo.values()].flatMap((l) => l.slice(0, k));
    }
    const conti = [...perTipo.entries()].map(([tipo, l]) => ({ tipo, nelCampione: l.length })).sort((a, b) => a.tipo.localeCompare(b.tipo));

    const file = join(cartella, `${n.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`);
    writeFileSync(
      file,
      JSON.stringify(
        {
          negozio: n.nome,
          dominioAdmin: n.dominio,
          dominioPubblico: shop.shop.primaryDomain.url,
          valuta: shop.shop.currencyCode,
          prodottiAttiviLetti: totale,
          tipiProdotto: conti,
          definizioniMetafield: defs.metafieldDefinitions.nodes,
          prodotti: campione,
        },
        null,
        2,
      ),
      "utf8",
    );
    console.log(`${n.nome}: ${totale} attivi letti, ${campione.length} nel campione su ${perTipo.size} tipi, ${defs.metafieldDefinitions.nodes.length} definizioni → ${file} (sito ${shop.shop.primaryDomain.url})`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

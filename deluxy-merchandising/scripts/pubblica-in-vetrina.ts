// **Mettere sulla vetrina un prodotto che è solo «attivo» nell'admin.**
//
// 11/09/2026. Da Shopify **2025-10** un prodotto creato via API non finisce più
// da solo sul canale «Online Store»: nasce ACTIVE nell'admin e il cliente non
// lo vede. (I due prodotti creati dal modulo il 10/09, con la versione API
// precedente, sono in vetrina; quello del 11/09 no: è la prova.)
//
// Serve il permesso `write_publications` sul token del negozio. Se non c'è,
// questo script lo dice con le parole di Shopify invece di fallire in silenzio.
//
// Uso:
//   npx tsx scripts/pubblica-in-vetrina.ts <id-prodotto> --prova   (non scrive)
//   npx tsx scripts/pubblica-in-vetrina.ts <id-prodotto>

import { prisma } from "../src/lib/db";
import { tokenDi, VERSIONE_API } from "../src/lib/negozi";

async function chiedi(token: { dominio: string; token: string }, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(`https://${token.dominio}/admin/api/${VERSIONE_API}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token.token },
    body: JSON.stringify({ query, variables }),
  });
  return (await res.json()) as { data?: any; errors?: unknown };
}

async function main() {
  const id = process.argv[2];
  const prova = process.argv.includes("--prova");
  if (!id) { console.error("Serve l'id del prodotto in Merchandising."); process.exit(1); }

  const p = await prisma.prodotto.findUnique({
    where: { id },
    select: { nome: true, codice: true, shopifyId: true, negozioNome: true,
      pubblicazioni: { select: { negozio: true, shopifyId: true, statoShopify: true } } },
  });
  if (!p) { console.error("Prodotto non trovato."); process.exit(1); }
  const negozi = await prisma.negozioShopify.findMany({ select: { id: true, nome: true, canaleVendite: true } });
  const righe = p.pubblicazioni.length ? p.pubblicazioni : [{ negozio: p.negozioNome ?? "", shopifyId: p.shopifyId, statoShopify: null }];

  console.log(`${p.nome} (${p.codice})${prova ? "  — PROVA, non scrivo" : ""}\n`);
  for (const r of righe) {
    if (!r.shopifyId) continue;
    const n = negozi.find((x) => x.nome === r.negozio);
    const token = n ? await tokenDi(n.id).catch(() => null) : null;
    if (!token) { console.log(`${r.negozio}: non so autenticarmi.`); continue; }

    const canali = await chiedi(token, `query { publications(first: 20) { nodes { id name } } }`);
    const nodi = canali?.data?.publications?.nodes as { id: string; name: string }[] | undefined;
    if (!nodi) {
      console.log(`${r.negozio}: ❌ non posso leggere i canali — ${JSON.stringify(canali.errors ?? canali).slice(0, 200)}`);
      console.log(`   Rimedio: aggiungere «read_publications» e «write_publications» al token di questo negozio.`);
      continue;
    }
    const os = nodi.find((x) => /online store/i.test(x.name));
    if (!os) { console.log(`${r.negozio}: nessun canale «Online Store».`); continue; }
    if (prova) { console.log(`${r.negozio}: pubblicherei su «${os.name}».`); continue; }

    const esito = await chiedi(
      token,
      `mutation($id: ID!, $pub: ID!) {
        publishablePublish(id: $id, input: { publicationId: $pub }) {
          userErrors { field message }
          publishable { ... on Product { publishedAt onlineStoreUrl } }
        }
      }`,
      { id: r.shopifyId, pub: os.id },
    );
    const err = esito?.data?.publishablePublish?.userErrors ?? [];
    if (esito.errors || err.length) {
      console.log(`${r.negozio}: ❌ ${JSON.stringify(esito.errors ?? err).slice(0, 260)}`);
      continue;
    }
    const q = esito?.data?.publishablePublish?.publishable;
    console.log(`${r.negozio}: ✅ pubblicato il ${q?.publishedAt} — ${q?.onlineStoreUrl ?? "(indirizzo non ancora propagato)"}`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

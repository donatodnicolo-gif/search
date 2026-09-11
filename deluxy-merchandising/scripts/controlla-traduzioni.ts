// **Che cosa c'è davvero nelle traduzioni di un prodotto sul negozio.**
//
// 11/09/2026, due segnalazioni dell'utente: su cakedesign.me la versione
// inglese di «Beauty Week Cake» esce come un paragrafo unico (niente tab), e su
// deluxyflowers.com/en «Bouquet Cherry» ha le tab ma scritte in italiano.
//
// Sono due cose diverse — una traduzione che ha perso la struttura, e una
// traduzione che non c'è — e si distinguono solo guardando che cosa Shopify
// tiene davvero. Questo script lo chiede, senza scrivere niente.
//
// Uso: npx tsx scripts/controlla-traduzioni.ts <sku-o-parte-del-nome>

import { prisma } from "../src/lib/db";
import { tokenDi, VERSIONE_API } from "../src/lib/negozi";

const QUERY = `
  query($id: ID!, $locale: String!) {
    translatableResource(resourceId: $id) {
      translations(locale: $locale) { key value }
      translatableContent { key value digest }
    }
  }
`;

async function main() {
  const cerca = process.argv[2];
  if (!cerca) { console.error("Serve lo SKU o parte del nome."); process.exit(1); }
  const p = await prisma.prodotto.findFirst({
    where: { OR: [{ codice: cerca }, { nome: { contains: cerca, mode: "insensitive" } }] },
    select: { nome: true, codice: true, shopifyId: true, negozioNome: true, descrizione: true },
  });
  if (!p || !p.shopifyId) { console.error("Prodotto non trovato, o non è su Shopify."); process.exit(1); }
  const n = await prisma.negozioShopify.findFirst({ where: { nome: p.negozioNome ?? "" }, select: { id: true, nome: true, lingueAttive: true } });
  if (!n) { console.error("Negozio sconosciuto."); process.exit(1); }
  const token = await tokenDi(n.id).catch(() => null);
  if (!token) { console.error("Non so autenticarmi."); process.exit(1); }

  console.log(`${p.nome} (${p.codice}) · negozio ${n.nome}\n`);
  const lingue = Array.isArray(n.lingueAttive) ? (n.lingueAttive as string[]) : [];
  console.log(`Lingue dichiarate attive qui: ${lingue.join(", ") || "nessuna"}\n`);

  for (const locale of ["en", ...lingue.filter((l) => l !== "en")].slice(0, 4)) {
    const res = await fetch(`https://${token.dominio}/admin/api/${VERSIONE_API}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token.token },
      body: JSON.stringify({ query: QUERY, variables: { id: p.shopifyId, locale } }),
    });
    const c = (await res.json()) as { data?: any; errors?: unknown };
    const tr = c?.data?.translatableResource;
    if (!tr) { console.log(`${locale}: ${JSON.stringify(c.errors ?? c).slice(0, 200)}`); continue; }
    const trad = (tr.translations ?? []) as { key: string; value: string }[];
    console.log(`── ${locale}: ${trad.length ? trad.map((x) => x.key).join(", ") : "NESSUNA TRADUZIONE"}`);
    for (const t of trad) {
      const corpo = String(t.value ?? "");
      if (t.key === "body_html") {
        const titoli = [...corpo.matchAll(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gis)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
        const strong = [...corpo.matchAll(/<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/gis)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
        console.log(`   descrizione: ${corpo.length} caratteri · titoli di sezione: ${titoli.length ? titoli.join(" | ") : "NESSUNO"}`);
        if (!titoli.length && strong.length) console.log(`   (grassetti trovati: ${strong.slice(0, 6).join(" | ")})`);
        console.log(`   inizio: ${corpo.replace(/\s+/g, " ").slice(0, 160)}`);
      } else {
        console.log(`   ${t.key}: ${corpo.slice(0, 90)}`);
      }
    }
  }

  // Com'è fatta la descrizione ITALIANA, per confronto.
  const it = String(p.descrizione ?? "");
  const titoliIt = [...it.matchAll(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gis)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  console.log(`\nDescrizione italiana qui: ${it.length} caratteri · titoli: ${titoliIt.length ? titoliIt.join(" | ") : "nessuno (è testo semplice)"}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });

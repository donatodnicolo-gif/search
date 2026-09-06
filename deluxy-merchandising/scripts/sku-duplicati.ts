// Cerca gli **SKU duplicati** sui negozi Shopify: lo stesso SKU su prodotti
// diversi dentro un negozio (tutti gli stati) e lo stesso SKU su negozi diversi.
// Sola lettura. Rapporto in docs/sku-duplicati-<data>.md.
//
//   npx tsx scripts/sku-duplicati.ts

import { readFileSync, writeFileSync } from "node:fs";

type V = { id: string; sku: string | null; title: string; product: { id: string; title: string; handle: string; status: string } };
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

  const negozi = await negoziAttivi();
  const tutte: { negozio: string; v: V }[] = [];
  for (const n of negozi) {
    let cursor: string | null = null;
    let conta = 0;
    for (;;) {
      const r = await graphqlNegozio(n.dominio, n.token,
        `query($c:String){ productVariants(first:250, after:$c){ pageInfo{ hasNextPage endCursor } nodes{ id sku title product{ id title handle status } } } }`, { c: cursor });
      const errori = r.corpo.errors?.map((e) => e.message) ?? [];
      if (r.status === 429 || errori.some((e) => /throttl/i.test(e))) { await attendi(2500); continue; }
      if (errori.length || r.status !== 200) throw new Error(`${n.nome}: HTTP ${r.status} ${errori.join("; ")}`);
      const d = r.corpo.data?.productVariants as unknown as { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: V[] };
      for (const v of d.nodes) { tutte.push({ negozio: n.nome, v }); conta++; }
      if (!d.pageInfo.hasNextPage) break;
      cursor = d.pageInfo.endCursor;
      await attendi(250);
    }
    console.log(`${n.nome}: ${conta} varianti lette`);
  }

  const chiave = (s: string) => s.trim().toLowerCase();
  // dentro un negozio: sku → prodotti distinti
  const md: string[] = [`# SKU duplicati sui negozi — ${new Date().toISOString().slice(0, 10)}`, "", "Letti tutti i prodotti (attivi, bozze, archiviati). «Duplicato» = lo stesso SKU su **prodotti diversi**; le varianti dello stesso prodotto con lo stesso SKU sono contate a parte.", ""];
  let totDentro = 0;
  for (const n of negozi) {
    const perSku = new Map<string, Map<string, { titolo: string; handle: string; status: string; varianti: string[] }>>();
    const stessoProdotto = new Map<string, { titolo: string; sku: string; n: number }>();
    for (const { negozio, v } of tutte) {
      if (negozio !== n.nome || !v.sku || !v.sku.trim()) continue;
      const k = chiave(v.sku);
      const prodotti = perSku.get(k) ?? new Map();
      const p = prodotti.get(v.product.id) ?? { titolo: v.product.title, handle: v.product.handle, status: v.product.status, varianti: [] };
      p.varianti.push(v.title);
      prodotti.set(v.product.id, p);
      perSku.set(k, prodotti);
    }
    const dup = [...perSku.entries()].filter(([, p]) => p.size > 1);
    const dupAttivi = dup.filter(([, p]) => [...p.values()].filter((x) => x.status === "ACTIVE").length > 1);
    for (const [k, p] of perSku) for (const [, x] of p) if (x.varianti.length > 1) stessoProdotto.set(`${k}|${x.handle}`, { titolo: x.titolo, sku: k, n: x.varianti.length });
    totDentro += dup.length;
    console.log(`\n=== ${n.nome}: ${dup.length} SKU su più prodotti (di cui ${dupAttivi.length} su più prodotti ATTIVI); ${stessoProdotto.size} casi di SKU ripetuto fra varianti dello stesso prodotto`);
    md.push(`## ${n.nome} — ${dup.length} SKU su più prodotti (${dupAttivi.length} fra prodotti attivi)`, "");
    md.push("| SKU | Prodotti (stato) |", "|---|---|");
    const righe = dup.sort((a, b) => b[1].size - a[1].size);
    for (const [k, p] of righe) {
      const desc = [...p.values()].map((x) => `${x.titolo} \`${x.handle}\` (${x.status}${x.varianti.length > 1 ? `, ${x.varianti.length} varianti` : ""})`).join(" · ");
      md.push(`| \`${k}\` | ${desc} |`);
    }
    md.push("");
    for (const [k, p] of righe.slice(0, 12)) console.log(`  ${k}: ${[...p.values()].map((x) => `${x.titolo} (${x.status})`).join(" · ")}`);
    if (stessoProdotto.size) {
      md.push(`### ${n.nome} — SKU ripetuto fra varianti dello stesso prodotto (${stessoProdotto.size})`, "", "| Prodotto | SKU | Varianti con quello SKU |", "|---|---|---:|");
      for (const x of [...stessoProdotto.values()].sort((a, b) => b.n - a.n)) md.push(`| ${x.titolo} | \`${x.sku}\` | ${x.n} |`);
      md.push("");
    }
  }
  // fra negozi
  const perSkuNeg = new Map<string, Map<string, Set<string>>>(); // sku → negozio → titoli
  for (const { negozio, v } of tutte) {
    if (!v.sku || !v.sku.trim()) continue;
    const k = chiave(v.sku);
    const m = perSkuNeg.get(k) ?? new Map();
    const t = m.get(negozio) ?? new Set();
    t.add(`${v.product.title} (${v.product.status})`);
    m.set(negozio, t);
    perSkuNeg.set(k, m);
  }
  const fra = [...perSkuNeg.entries()].filter(([, m]) => m.size > 1);
  const fraDiversi = fra.filter(([, m]) => { const titoli = [...m.values()].map((s) => [...s].map((x) => x.replace(/ \((ACTIVE|DRAFT|ARCHIVED)\)$/, "")).sort().join("|")); return new Set(titoli).size > 1; });
  console.log(`\n=== Fra negozi: ${fra.length} SKU presenti su più negozi, di cui ${fraDiversi.length} con titoli diversi (probabili prodotti diversi); gli altri sono lo stesso prodotto venduto su due negozi`);
  md.push(`## Fra negozi — ${fra.length} SKU su più negozi, ${fraDiversi.length} con titoli diversi`, "", "Lo stesso prodotto venduto su due negozi porta lo stesso SKU: non è un errore. Qui sotto solo quelli con **titoli diversi**.", "", "| SKU | Negozi e prodotti |", "|---|---|");
  for (const [k, m] of fraDiversi) md.push(`| \`${k}\` | ${[...m.entries()].map(([n, s]) => `**${n}**: ${[...s].join(", ")}`).join(" · ")} |`);
  md.push("");
  for (const [k, m] of fraDiversi.slice(0, 15)) console.log(`  ${k}: ${[...m.entries()].map(([n, s]) => `${n}: ${[...s].join(", ")}`).join(" · ")}`);

  const file = `docs/sku-duplicati-${new Date().toISOString().slice(0, 10)}.md`;
  writeFileSync(file, md.join("\n") + "\n");
  console.log(`\nRapporto in ${file}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

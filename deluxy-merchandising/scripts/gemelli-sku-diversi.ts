// Elenca i **gemelli con SKU diverso**: lo stesso prodotto (stesso handle) su
// Flowers/Cake e su Gifts, la stessa variante (stesso titolo), SKU diverso.
// Sola lettura; rapporto in docs/gemelli-sku-diversi-<data>.md.
//
//   npx tsx scripts/gemelli-sku-diversi.ts

import { readFileSync, writeFileSync } from "node:fs";

type V = { id: string; sku: string | null; title: string; product: { id: string; title: string; handle: string; status: string } };
const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));
const vuoto = (s: string | null | undefined) => !s || s.trim() === "";
const chiave = (s: string) => s.trim().toLowerCase();

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
  const perNegozio = new Map<string, V[]>();
  for (const n of negozi) {
    const righe: V[] = [];
    let cursor: string | null = null;
    for (;;) {
      const r = await graphqlNegozio(n.dominio, n.token,
        `query($c:String){ productVariants(first:250, after:$c){ pageInfo{ hasNextPage endCursor } nodes{ id sku title product{ id title handle status } } } }`, { c: cursor });
      const errori = r.corpo.errors?.map((e) => e.message) ?? [];
      if (r.status === 429 || errori.some((e) => /throttl/i.test(e))) { await attendi(2500); continue; }
      if (errori.length || r.status !== 200) throw new Error(`${n.nome}: HTTP ${r.status} ${errori.join("; ")}`);
      const d = r.corpo.data?.productVariants as unknown as { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: V[] };
      righe.push(...d.nodes);
      if (!d.pageInfo.hasNextPage) break;
      cursor = d.pageInfo.endCursor;
      await attendi(250);
    }
    perNegozio.set(n.nome, righe);
  }
  const perHandle = new Map<string, Map<string, V[]>>();
  for (const [nome, righe] of perNegozio) for (const v of righe) {
    const m = perHandle.get(v.product.handle) ?? new Map();
    m.set(nome, [...(m.get(nome) ?? []), v]);
    perHandle.set(v.product.handle, m);
  }
  const righe: { handle: string; titolo: string; origine: string; statoOrigine: string; statoGifts: string; variante: string; skuOrigine: string; skuGifts: string }[] = [];
  for (const [handle, m] of perHandle) {
    const gifts = m.get("Gifts");
    const orig = m.get("Flowers") ? "Flowers" : m.get("Cake") ? "Cake" : null;
    if (!gifts || !orig) continue;
    const ov = m.get(orig)!;
    // se il prodotto di origine è doppio (ACTIVE + DRAFT), si prende l'ACTIVE
    const attivoOrig = ov.filter((v) => v.product.status === "ACTIVE");
    const usati = attivoOrig.length ? attivoOrig : ov;
    const perTitolo = new Map(usati.filter((v) => !vuoto(v.sku)).map((v) => [v.title, v]));
    const attiviG = gifts.filter((v) => v.product.status === "ACTIVE");
    const usatiG = attiviG.length ? attiviG : gifts;
    for (const g of usatiG) {
      const o = perTitolo.get(g.title);
      if (!o || vuoto(g.sku) || chiave(g.sku!) === chiave(o.sku!)) continue;
      righe.push({ handle, titolo: g.product.title, origine: orig, statoOrigine: o.product.status, statoGifts: g.product.status, variante: g.title, skuOrigine: o.sku!, skuGifts: g.sku! });
    }
  }
  const rango: Record<string, number> = { ACTIVE: 0, DRAFT: 1, ARCHIVED: 2 };
  righe.sort((a, b) => (rango[a.statoGifts] + rango[a.statoOrigine]) - (rango[b.statoGifts] + rango[b.statoOrigine]) || a.handle.localeCompare(b.handle));
  const entrambiAttivi = righe.filter((r) => r.statoGifts === "ACTIVE" && r.statoOrigine === "ACTIVE");
  const md = [`# Gemelli con SKU diverso — ${new Date().toISOString().slice(0, 10)}`, "", `${righe.length} varianti su ${new Set(righe.map((r) => r.handle)).size} prodotti; ${entrambiAttivi.length} con entrambi i lati attivi. Stesso handle sui due negozi, stesso titolo di variante, SKU diverso.`, "", "| Prodotto | Variante | Origine | SKU origine | SKU Gifts | Stato origine / Gifts |", "|---|---|---|---|---|---|"];
  for (const r of righe) md.push(`| ${r.titolo.replace(/\|/g, "/")} \`${r.handle}\` | ${r.variante.replace(/\|/g, "/")} | ${r.origine} | \`${r.skuOrigine}\` | \`${r.skuGifts}\` | ${r.statoOrigine} / ${r.statoGifts} |`);
  const file = `docs/gemelli-sku-diversi-${new Date().toISOString().slice(0, 10)}.md`;
  writeFileSync(file, md.join("\n") + "\n");
  console.log(`${righe.length} varianti su ${new Set(righe.map((r) => r.handle)).size} prodotti; entrambi attivi: ${entrambiAttivi.length}; rapporto in ${file}`);
  for (const r of righe.slice(0, 30)) console.log(`${r.statoOrigine}/${r.statoGifts} | ${r.titolo} | ${r.variante} | ${r.origine}: ${r.skuOrigine} | Gifts: ${r.skuGifts}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

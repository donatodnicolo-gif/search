// Allinea gli SKU delle varianti **qui** a quelli del negozio, scheda per
// scheda (per `shopifyId`, variante per nome). Serve dopo aver reso unici gli
// SKU sui negozi: le schede dei prodotti che hanno perso lo SKU condiviso
// tenevano ancora quello vecchio, e così bloccavano (Variante.sku è @unique) la
// scheda che quello SKU ora lo possiede davvero.
//
// Due fasi nella stessa corsa: (1) chi ha uno SKU diverso da quello del negozio
// lo cambia; (2) chi non ce l'ha lo prende. I conflitti di unicità si
// riprovano a giri, perché la fase 1 libera i valori che la fase 2 aspetta. Chi
// resta in conflitto alla fine sono due schede che puntano allo stesso prodotto
// del negozio: si elencano, non si forzano.
//
//   npx tsx scripts/allinea-sku-db.ts            # prova
//   npx tsx scripts/allinea-sku-db.ts --applica

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
  const { prisma } = await import("../src/lib/db");
  const applica = process.argv.includes("--applica");

  // Negozi: gid prodotto → (nome variante → sku)
  const perGid = new Map<string, { negozio: string; titolo: string; status: string; sku: Map<string, string> }>();
  for (const n of await negoziAttivi()) {
    let cursor: string | null = null;
    let conta = 0;
    for (;;) {
      const r = await graphqlNegozio(n.dominio, n.token,
        `query($c:String){ productVariants(first:250, after:$c){ pageInfo{ hasNextPage endCursor } nodes{ id sku title product{ id title handle status } } } }`, { c: cursor });
      const errori = r.corpo.errors?.map((e) => e.message) ?? [];
      if (r.status === 429 || errori.some((e) => /throttl/i.test(e))) { await attendi(2500); continue; }
      if (errori.length || r.status !== 200) throw new Error(`${n.nome}: HTTP ${r.status} ${errori.join("; ")}`);
      const d = r.corpo.data?.productVariants as unknown as { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: V[] };
      for (const v of d.nodes) {
        const p = perGid.get(v.product.id) ?? { negozio: n.nome, titolo: v.product.title, status: v.product.status, sku: new Map() };
        const nome = v.title === "Default Title" ? "Unica" : v.title;
        if (!vuoto(v.sku) && !p.sku.has(nome)) p.sku.set(nome, v.sku!.trim());
        perGid.set(v.product.id, p);
        conta++;
      }
      if (!d.pageInfo.hasNextPage) break;
      cursor = d.pageInfo.endCursor;
      await attendi(250);
    }
    console.log(`${n.nome}: ${conta} varianti lette`);
  }

  // Schede con shopifyId e le loro varianti
  const schede = await prisma.prodotto.findMany({
    where: { shopifyId: { not: null } },
    select: { id: true, nome: true, shopifyId: true, statoShopify: true, unitoAId: true, varianti: { select: { id: true, nome: true, sku: true } } },
  });
  type Cambio = { varianteId: string; scheda: string; nome: string; prima: string | null; dopo: string; fase: 1 | 2 };
  const cambi: Cambio[] = [];
  let senzaNegozio = 0, nomeAssente = 0;
  const perGidSchede = new Map<string, string[]>();
  for (const s of schede) {
    perGidSchede.set(s.shopifyId!, [...(perGidSchede.get(s.shopifyId!) ?? []), s.nome]);
    const p = perGid.get(s.shopifyId!);
    if (!p) { senzaNegozio++; continue; }
    for (const v of s.varianti) {
      const atteso = p.sku.get(v.nome);
      if (!atteso) { if (vuoto(v.sku)) nomeAssente++; continue; }
      if (vuoto(v.sku)) cambi.push({ varianteId: v.id, scheda: s.nome, nome: v.nome, prima: null, dopo: atteso, fase: 2 });
      else if (chiave(v.sku!) !== chiave(atteso)) cambi.push({ varianteId: v.id, scheda: s.nome, nome: v.nome, prima: v.sku, dopo: atteso, fase: 1 });
    }
  }
  const doppie = [...perGidSchede.entries()].filter(([, n]) => n.length > 1);
  const f1 = cambi.filter((c) => c.fase === 1), f2 = cambi.filter((c) => c.fase === 2);
  console.log(`\nSchede con shopifyId: ${schede.length}; il negozio non ha più quel prodotto: ${senzaNegozio}; varianti vuote senza un nome corrispondente sul negozio: ${nomeAssente}`);
  console.log(`Fase 1 (sku diverso dal negozio): ${f1.length} · Fase 2 (sku vuoto): ${f2.length}`);
  console.log(`Schede DOPPIE (stesso shopifyId): ${doppie.length} → ${doppie.slice(0, 8).map(([g, n]) => `${n.join(" = ")}`).join(" · ")}`);
  for (const c of f1.slice(0, 12)) console.log(`  1) ${c.scheda} · ${c.nome}: ${c.prima} → ${c.dopo}`);
  for (const c of f2.slice(0, 12)) console.log(`  2) ${c.scheda} · ${c.nome}: ∅ → ${c.dopo}`);

  const md = [`# Allineamento SKU del database al negozio — ${new Date().toISOString().slice(0, 10)}`, "", `${applica ? "Applicato" : "Prova"}: fase 1 (sku diverso) ${f1.length}, fase 2 (sku vuoto) ${f2.length}. Schede doppie sullo stesso prodotto Shopify: ${doppie.length}.`, "", "| Scheda | Variante | Prima | Dopo |", "|---|---|---|---|",
    ...cambi.map((c) => `| ${c.scheda.replace(/\|/g, "/")} | ${c.nome.replace(/\|/g, "/")} | ${c.prima ? `\`${c.prima}\`` : "∅"} | \`${c.dopo}\` |`), "",
    `## Schede doppie (stesso shopifyId) — ${doppie.length}`, "", ...doppie.map(([g, n]) => `- ${n.join(" = ")} (\`${g}\`)`), ""];
  if (!applica) { writeFileSync("docs/allinea-sku-db-prova.md", md.join("\n") + "\n"); console.log("\nProva: niente scritto. Piano in docs/allinea-sku-db-prova.md"); await prisma.$disconnect(); return; }

  let ok = 0;
  let coda = [...f1, ...f2];
  for (let giro = 1; giro <= 6 && coda.length; giro++) {
    const rimasti: Cambio[] = [];
    for (const c of coda) {
      try { await prisma.variante.update({ where: { id: c.varianteId }, data: { sku: c.dopo } }); ok++; }
      catch (e) { if (e instanceof Error && /Unique|unique/.test(e.message)) rimasti.push(c); else throw e; }
    }
    console.log(`giro ${giro}: ${coda.length - rimasti.length} scritte, ${rimasti.length} in conflitto`);
    coda = rimasti;
  }
  const restano = await prisma.variante.count({ where: { prodotto: { statoShopify: "ACTIVE" }, OR: [{ sku: null }, { sku: "" }] } });
  md.push("## Esito", "", `${ok} varianti aggiornate; ${coda.length} in conflitto di unicità alla fine (due schede per lo stesso prodotto del negozio); varianti ACTIVE senza sku ora: ${restano}.`, "", ...coda.map((c) => `- ${c.scheda} · ${c.nome}: ${c.dopo} è già di un'altra scheda`), "");
  writeFileSync(`docs/allinea-sku-db-${new Date().toISOString().slice(0, 10)}.md`, md.join("\n") + "\n");
  console.log(`\n${ok} aggiornate, ${coda.length} in conflitto, varianti ACTIVE senza sku ora: ${restano}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

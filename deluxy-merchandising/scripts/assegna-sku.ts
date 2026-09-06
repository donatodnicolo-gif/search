// Assegna lo SKU alle varianti **senza SKU** dei prodotti pubblicati (ACTIVE)
// sui negozi Shopify, e lo riporta sulle varianti corrispondenti qui.
//
// Regola (la stessa del modulo «Nuovo prodotto», 04/09/2026): il prodotto ha un
// codice di 7 cifre e le varianti sono `codice-1`, `codice-2`… Se il prodotto
// ha già SKU con una base comune (ICQLBN-1, ICQLBN-2 → ICQLBN), si continua
// quella numerazione: le nuove sono ICQLBN-3, -4… Se non c'è una base comune,
// nasce un codice nuovo. Lo SKU è unico in tutta l'app (Variante.sku @unique) e
// qui lo si tiene unico anche fra i tre negozi.
//
//   (dalla cartella deluxy-merchandising)
//   npx tsx scripts/assegna-sku.ts              # prova: stampa cosa farebbe
//   npx tsx scripts/assegna-sku.ts --applica    # scrive sui negozi e qui
//   npx tsx scripts/assegna-sku.ts Cake --applica
//
// Il piano (prima/dopo) va in `docs/assegnazione-sku-<data>.md`, così è
// reversibile a mano. Carica .env a mano (tsx non lo fa); niente top-level await.

import { readFileSync, writeFileSync } from "node:fs";

type VarianteApi = { id: string; sku: string | null; title: string; product: { id: string; title: string; handle: string; status: string } };

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));
const vuoto = (s: string | null | undefined) => !s || s.trim() === "";
function skuCasuale(): string {
  return String(Math.floor(1_000_000 + Math.random() * 9_000_000));
}

async function main() {
  for (const line of readFileSync("./.env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
  const { negoziAttivi } = await import("../src/lib/negozi");
  const { graphqlNegozio, erroriDi } = await import("../src/lib/shopify-scrittura");
  const { prisma } = await import("../src/lib/db");

  const args = process.argv.slice(2);
  const applica = args.includes("--applica");
  const scelti = args.filter((a) => !a.startsWith("--")).map((s) => s.toLowerCase());
  const tutti = await negoziAttivi();
  const negozi = scelti.length ? tutti.filter((n) => scelti.includes(n.nome.toLowerCase())) : tutti;
  if (negozi.length === 0) throw new Error("Nessun negozio attivo (o nessuno col nome chiesto).");

  // — Tutti gli SKU già presi: nei tre negozi (ogni stato) e qui —
  const presi = new Set<string>();
  const prendi = (s: string | null | undefined) => { if (!vuoto(s)) presi.add(s!.trim().toLowerCase()); };
  const perNegozio = new Map<string, VarianteApi[]>();
  for (const n of tutti) {
    const righe: VarianteApi[] = [];
    let cursor: string | null = null;
    for (;;) {
      const r = await graphqlNegozio(n.dominio, n.token,
        `query($c:String){ productVariants(first:250, after:$c){ pageInfo{ hasNextPage endCursor } nodes{ id sku title product{ id title handle status } } } }`, { c: cursor });
      const errori = r.corpo.errors?.map((e) => e.message) ?? [];
      if (r.status === 429 || errori.some((e) => /throttl/i.test(e))) { await attendi(2500); continue; }
      if (errori.length || r.status !== 200) throw new Error(`${n.nome}: HTTP ${r.status} ${errori.join("; ")}`);
      const d = r.corpo.data?.productVariants as unknown as { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: VarianteApi[] };
      righe.push(...d.nodes);
      if (!d.pageInfo.hasNextPage) break;
      cursor = d.pageInfo.endCursor;
      await attendi(250);
    }
    for (const v of righe) prendi(v.sku);
    perNegozio.set(n.nome, righe);
    console.log(`${n.nome}: ${righe.length} varianti lette (tutti gli stati)`);
  }
  for (const p of await prisma.prodotto.findMany({ select: { codice: true } })) prendi(p.codice);
  for (const v of await prisma.variante.findMany({ select: { sku: true } })) prendi(v.sku);
  console.log(`SKU/codici già presi (negozi + database): ${presi.size}`);

  const libero = (s: string) => !presi.has(s.toLowerCase());
  const riserva = (s: string) => { presi.add(s.toLowerCase()); return s; };

  type Piano = { negozio: string; prodottoId: string; titolo: string; handle: string; base: string; nuovoCodice: boolean; varianti: { id: string; titolo: string; sku: string }[] };
  const piani: Piano[] = [];

  for (const n of negozi) {
    const righe = perNegozio.get(n.nome)!;
    const perProdotto = new Map<string, VarianteApi[]>();
    for (const v of righe) {
      if (v.product.status !== "ACTIVE") continue;
      perProdotto.set(v.product.id, [...(perProdotto.get(v.product.id) ?? []), v]);
    }
    for (const [pid, vs] of perProdotto) {
      const mancanti = vs.filter((v) => vuoto(v.sku));
      if (mancanti.length === 0) continue;
      const esistenti = vs.filter((v) => !vuoto(v.sku)).map((v) => v.sku!.trim());
      // Base comune: prima nella forma `BASE-N`, poi `BASEN` (MQQUB1, MQQUB2).
      let base: string | null = null;
      if (esistenti.length) {
        const b1 = new Set(esistenti.map((s) => s.replace(/-\d+$/, "")));
        const b2 = new Set(esistenti.map((s) => s.replace(/-?\d+$/, "")));
        if (b1.size === 1 && [...b1][0].length >= 3 && esistenti.some((s) => /-\d+$/.test(s))) base = [...b1][0];
        else if (b2.size === 1 && [...b2][0].length >= 3) base = [...b2][0];
      }
      let nuovoCodice = false;
      if (!base) {
        nuovoCodice = true;
        do base = skuCasuale(); while (!libero(base) || mancanti.some((_, i) => !libero(`${base}-${i + 1}`)));
      }
      const unica = vs.length === 1 && vs[0].title === "Default Title";
      const nuove: { id: string; titolo: string; sku: string }[] = [];
      if (unica) {
        nuove.push({ id: vs[0].id, titolo: vs[0].title, sku: riserva(nuovoCodice ? base : `${base}-1`) });
      } else {
        // Si continua la numerazione dal suffisso più alto già usato in questo prodotto.
        let k = 0;
        for (const s of esistenti) { const m = s.match(/-?(\d+)$/); if (m && s.toLowerCase().startsWith(base.toLowerCase())) k = Math.max(k, Number(m[1])); }
        for (const v of mancanti) {
          let sku: string;
          do { k++; sku = `${base}-${k}`; } while (!libero(sku));
          nuove.push({ id: v.id, titolo: v.title, sku: riserva(sku) });
        }
      }
      if (nuovoCodice) riserva(base);
      piani.push({ negozio: n.nome, prodottoId: pid, titolo: vs[0].product.title, handle: vs[0].product.handle, base, nuovoCodice, varianti: nuove });
    }
  }

  // — Il piano, leggibile —
  const md: string[] = [`# Assegnazione SKU — ${new Date().toISOString().slice(0, 10)}`, "",
    `${applica ? "Applicato" : "Prova (non applicato)"}: ${piani.length} prodotti, ${piani.reduce((a, p) => a + p.varianti.length, 0)} varianti. Prima dell'assegnazione lo SKU era vuoto su tutte le varianti elencate: per tornare indietro basta svuotarlo.`, ""];
  for (const n of negozi) {
    const miei = piani.filter((p) => p.negozio === n.nome);
    md.push(`## ${n.nome} — ${miei.length} prodotti`, "", "| Prodotto | Handle | Base | Variante | SKU nuovo |", "|---|---|---|---|---|");
    for (const p of miei) for (const v of p.varianti) md.push(`| ${p.titolo.replace(/\|/g, "/")} | \`${p.handle}\` | ${p.base}${p.nuovoCodice ? " (nuovo)" : ""} | ${v.titolo.replace(/\|/g, "/")} | \`${v.sku}\` |`);
    md.push("");
    console.log(`\n=== ${n.nome}: ${miei.length} prodotti, ${miei.reduce((a, p) => a + p.varianti.length, 0)} varianti`);
    for (const p of miei) console.log(`  ${p.titolo} [${p.base}${p.nuovoCodice ? " nuovo" : ""}]: ${p.varianti.map((v) => `${v.titolo}→${v.sku}`).join(", ")}`);
  }

  if (!applica) {
    writeFileSync(`docs/assegnazione-sku-prova.md`, md.join("\n") + "\n");
    console.log("\nProva: niente scritto sui negozi. Piano in docs/assegnazione-sku-prova.md. Rilancia con --applica.");
    await prisma.$disconnect();
    return;
  }

  // — Scrittura: prima il negozio, poi qui; ogni prodotto è una mutation —
  let okNegozio = 0, errNegozio = 0, okDb = 0, saltatiDb = 0;
  const esiti: string[] = [];
  for (const p of piani) {
    const n = negozi.find((x) => x.nome === p.negozio)!;
    const r = await graphqlNegozio(n.dominio, n.token,
      `mutation($productId:ID!, $variants:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$productId, variants:$variants){ userErrors{ field message } } }`,
      { productId: p.prodottoId, variants: p.varianti.map((v) => ({ id: v.id, inventoryItem: { sku: v.sku } })) });
    const errori = erroriDi(r, "productVariantsBulkUpdate");
    if (errori.length) { errNegozio++; esiti.push(`❌ ${p.negozio} · ${p.titolo}: ${errori.join("; ")}`); console.log(esiti[esiti.length - 1]); await attendi(300); continue; }
    okNegozio++;
    // Qui: la scheda per shopifyId (se è dell'altro negozio non si tocca) e la
    // variante per nome; solo dove lo sku è vuoto.
    const scheda = await prisma.prodotto.findFirst({ where: { shopifyId: p.prodottoId }, select: { id: true, varianti: { select: { id: true, nome: true, sku: true } } } });
    if (!scheda) { saltatiDb += p.varianti.length; esiti.push(`⚠️ ${p.negozio} · ${p.titolo}: SKU scritto sul negozio, scheda qui assente per questo id (prodotto di due negozi?)`); }
    else {
      for (const v of p.varianti) {
        const nome = v.titolo === "Default Title" ? "Unica" : v.titolo;
        const qui = scheda.varianti.find((x) => x.nome === nome && vuoto(x.sku));
        if (!qui) { saltatiDb++; continue; }
        try { await prisma.variante.update({ where: { id: qui.id }, data: { sku: v.sku } }); okDb++; }
        catch (e) { saltatiDb++; esiti.push(`⚠️ ${p.titolo} · ${nome}: sku non scritto qui (${e instanceof Error ? e.message.split("\n")[0] : e})`); }
      }
    }
    await attendi(300);
  }
  md.push("## Esito", "", `Negozi: ${okNegozio} prodotti aggiornati, ${errNegozio} errori. Database: ${okDb} varianti aggiornate, ${saltatiDb} non trovate qui (variante oltre la decima, scheda dell'altro negozio, o nome diverso).`, "", ...esiti.map((e) => `- ${e}`), "");
  const file = `docs/assegnazione-sku-${new Date().toISOString().slice(0, 10)}.md`;
  writeFileSync(file, md.join("\n") + "\n");
  console.log(`\nNegozi: ${okNegozio} ok, ${errNegozio} errori · Database: ${okDb} varianti, ${saltatiDb} saltate · piano in ${file}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

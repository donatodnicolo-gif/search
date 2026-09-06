// Rende **unico lo SKU dentro ogni negozio**: lo stesso SKU su prodotti diversi
// (per lo più vecchie copie archiviate) e lo stesso SKU su più varianti dello
// stesso prodotto. Lo stesso prodotto venduto su due negozi tiene lo stesso SKU
// (voluto): qui non si tocca.
//
// Chi tiene lo SKU: il prodotto ACTIVE, poi DRAFT, poi ARCHIVED; a parità il
// più vecchio (createdAt). Chi perde riceve un codice nuovo di 7 cifre e le
// sue varianti in conflitto diventano `codice-1`, `codice-2`… (il codice da
// solo se il prodotto ha una variante sola). Fra varianti dello stesso
// prodotto: la prima tiene lo SKU, le altre continuano la numerazione della
// base (`SFere-35`…). Ogni SKU nuovo è unico fra i tre negozi e il database.
//
//   npx tsx scripts/sku-unici.ts               # prova
//   npx tsx scripts/sku-unici.ts --applica     # scrive sui negozi e qui
//
// Piano prima/dopo in docs/sku-unici-<data>.md (reversibile a mano).

import { readFileSync, writeFileSync } from "node:fs";

type V = { id: string; sku: string | null; title: string; position: number; product: { id: string; title: string; handle: string; status: string; createdAt: string } };
const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));
const vuoto = (s: string | null | undefined) => !s || s.trim() === "";
const chiave = (s: string) => s.trim().toLowerCase();
const skuCasuale = () => String(Math.floor(1_000_000 + Math.random() * 9_000_000));
const RANGO: Record<string, number> = { ACTIVE: 0, DRAFT: 1, ARCHIVED: 2 };

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
  const applica = process.argv.includes("--applica");
  const negozi = await negoziAttivi();

  // — Lettura di tutto —
  const perNegozio = new Map<string, V[]>();
  const presi = new Set<string>();
  for (const n of negozi) {
    const righe: V[] = [];
    let cursor: string | null = null;
    for (;;) {
      const r = await graphqlNegozio(n.dominio, n.token,
        `query($c:String){ productVariants(first:250, after:$c){ pageInfo{ hasNextPage endCursor } nodes{ id sku title position product{ id title handle status createdAt } } } }`, { c: cursor });
      const errori = r.corpo.errors?.map((e) => e.message) ?? [];
      if (r.status === 429 || errori.some((e) => /throttl/i.test(e))) { await attendi(2500); continue; }
      if (errori.length || r.status !== 200) throw new Error(`${n.nome}: HTTP ${r.status} ${errori.join("; ")}`);
      const d = r.corpo.data?.productVariants as unknown as { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: V[] };
      righe.push(...d.nodes);
      if (!d.pageInfo.hasNextPage) break;
      cursor = d.pageInfo.endCursor;
      await attendi(250);
    }
    for (const v of righe) if (!vuoto(v.sku)) presi.add(chiave(v.sku!));
    perNegozio.set(n.nome, righe);
    console.log(`${n.nome}: ${righe.length} varianti lette`);
  }
  for (const p of await prisma.prodotto.findMany({ select: { codice: true } })) presi.add(chiave(p.codice));
  for (const v of await prisma.variante.findMany({ select: { sku: true } })) if (!vuoto(v.sku)) presi.add(chiave(v.sku!));
  const libero = (s: string) => !presi.has(chiave(s));
  const riserva = (s: string) => { presi.add(chiave(s)); return s; };

  type Cambio = { negozio: string; prodottoId: string; titolo: string; handle: string; status: string; motivo: string; varianti: { id: string; titolo: string; prima: string; dopo: string }[] };
  const cambi: Cambio[] = [];

  for (const n of negozi) {
    const righe = perNegozio.get(n.nome)!;
    const perProdotto = new Map<string, V[]>();
    for (const v of righe) perProdotto.set(v.product.id, [...(perProdotto.get(v.product.id) ?? []), v]);
    for (const vs of perProdotto.values()) vs.sort((a, b) => a.position - b.position);

    // 1) stesso SKU su prodotti diversi → chi perde
    const perSku = new Map<string, Map<string, V[]>>(); // sku → prodotto → varianti
    for (const v of righe) {
      if (vuoto(v.sku)) continue;
      const k = chiave(v.sku!);
      const m = perSku.get(k) ?? new Map();
      m.set(v.product.id, [...(m.get(v.product.id) ?? []), v]);
      perSku.set(k, m);
    }
    const daRifare = new Map<string, Set<string>>(); // prodotto → variantId in conflitto (perdenti)
    for (const [, m] of perSku) {
      if (m.size < 2) continue;
      const ordine = [...m.entries()].sort((a, b) => {
        const pa = a[1][0].product, pb = b[1][0].product;
        return (RANGO[pa.status] ?? 9) - (RANGO[pb.status] ?? 9) || pa.createdAt.localeCompare(pb.createdAt) || pa.handle.localeCompare(pb.handle);
      });
      for (const [pid, vs] of ordine.slice(1)) {
        const s = daRifare.get(pid) ?? new Set();
        for (const v of vs) s.add(v.id);
        daRifare.set(pid, s);
      }
    }
    for (const [pid, ids] of daRifare) {
      const vs = perProdotto.get(pid)!;
      const p = vs[0].product;
      let base: string;
      do base = skuCasuale(); while (!libero(base) || vs.some((_, i) => !libero(`${base}-${i + 1}`)));
      riserva(base);
      const unica = vs.length === 1 && vs[0].title === "Default Title";
      const varianti: Cambio["varianti"] = [];
      let k = 0;
      for (const v of vs) {
        if (!ids.has(v.id)) continue;
        let sku: string;
        if (unica) sku = base; else do { k++; sku = `${base}-${k}`; } while (!libero(sku));
        varianti.push({ id: v.id, titolo: v.title, prima: v.sku!, dopo: riserva(sku) });
        v.sku = sku; // così il passo 2 vede già il nuovo
      }
      cambi.push({ negozio: n.nome, prodottoId: pid, titolo: p.title, handle: p.handle, status: p.status, motivo: "stesso SKU di un altro prodotto", varianti });
    }

    // 2) stesso SKU fra varianti dello stesso prodotto → la prima tiene
    for (const [pid, vs] of perProdotto) {
      const visti = new Set<string>();
      const varianti: Cambio["varianti"] = [];
      for (const v of vs) {
        if (vuoto(v.sku)) continue;
        const k = chiave(v.sku!);
        if (!visti.has(k)) { visti.add(k); continue; }
        const base = v.sku!.trim().replace(/-\d+$/, "");
        let n2 = 0;
        for (const x of vs) { const m = (x.sku ?? "").match(/-(\d+)$/); if (m && chiave(x.sku!).startsWith(chiave(base))) n2 = Math.max(n2, Number(m[1])); }
        let sku: string;
        do { n2++; sku = `${base}-${n2}`; } while (!libero(sku));
        varianti.push({ id: v.id, titolo: v.title, prima: v.sku!, dopo: riserva(sku) });
        v.sku = sku;
      }
      if (varianti.length) {
        const p = vs[0].product;
        const esistente = cambi.find((c) => c.prodottoId === pid);
        if (esistente) { esistente.varianti.push(...varianti); esistente.motivo += " + SKU ripetuto fra varianti"; }
        else cambi.push({ negozio: n.nome, prodottoId: pid, titolo: p.title, handle: p.handle, status: p.status, motivo: "SKU ripetuto fra varianti", varianti });
      }
    }
  }

  // 3) Lo stesso prodotto su due negozi porta lo stesso SKU (regola dell'utente,
  //    06/09). Stamattina `assegna-sku.ts` aveva dato SKU diversi ai gemelli
  //    (Flowers -6…-10, Gifts -11…-15): la copia su Gifts prende lo SKU del
  //    negozio di origine (Flowers o Cake), variante per variante (stesso
  //    titolo), purché quello SKU non sia già di un altro prodotto di Gifts.
  //    Si tocca solo ciò che è stato assegnato oggi: le differenze storiche si
  //    contano e si riportano, non si riscrivono alla cieca.
  const oggi = new Set<string>();
  try {
    for (const m of readFileSync("docs/assegnazione-sku-2026-09-06.md", "utf8").matchAll(/\| `([^`]+)` \|\s*$/gm)) oggi.add(chiave(m[1]));
  } catch { /* senza il file non si riallinea niente */ }
  const perHandle = new Map<string, Map<string, V[]>>(); // handle → negozio → varianti
  for (const [nome, righe] of perNegozio) for (const v of righe) {
    const m = perHandle.get(v.product.handle) ?? new Map();
    m.set(nome, [...(m.get(nome) ?? []), v]);
    perHandle.set(v.product.handle, m);
  }
  const skuGifts = new Map<string, string>(); // sku → productId su Gifts
  for (const v of perNegozio.get("Gifts") ?? []) if (!vuoto(v.sku)) skuGifts.set(chiave(v.sku!), v.product.id);
  let diffStoriche = 0, riallineate = 0, nonRiallineabili = 0;
  for (const [handle, m] of perHandle) {
    const gifts = m.get("Gifts");
    if (!gifts) continue;
    const origine = m.get("Flowers") ?? m.get("Cake");
    if (!origine) continue;
    const perTitolo = new Map(origine.filter((v) => !vuoto(v.sku)).map((v) => [v.title, v.sku!.trim()]));
    const cambio: Cambio["varianti"] = [];
    for (const g of gifts) {
      const atteso = perTitolo.get(g.title);
      if (!atteso || vuoto(g.sku) || chiave(g.sku!) === chiave(atteso)) continue;
      if (!oggi.has(chiave(g.sku!))) { diffStoriche++; continue; }
      const altro = skuGifts.get(chiave(atteso));
      if (altro && altro !== g.product.id) { nonRiallineabili++; continue; }
      // …né di un'altra variante dello stesso prodotto su Gifts.
      if (gifts.some((x) => x.id !== g.id && !vuoto(x.sku) && chiave(x.sku!) === chiave(atteso))) { nonRiallineabili++; continue; }
      cambio.push({ id: g.id, titolo: g.title, prima: g.sku!, dopo: atteso });
      skuGifts.set(chiave(atteso), g.product.id);
      g.sku = atteso;
      riallineate++;
    }
    if (cambio.length) {
      const p = gifts[0].product;
      const esistente = cambi.find((c) => c.prodottoId === p.id);
      if (esistente) { esistente.varianti.push(...cambio); esistente.motivo += " + stesso SKU del gemello"; }
      else cambi.push({ negozio: "Gifts", prodottoId: p.id, titolo: p.title, handle, status: p.status, motivo: "stesso SKU del gemello su Flowers/Cake", varianti: cambio });
    }
  }
  console.log(`\nGemelli su due negozi: ${riallineate} varianti di Gifts riallineate allo SKU di origine (assegnate oggi), ${nonRiallineabili} non riallineabili (SKU già di un altro prodotto Gifts), ${diffStoriche} differenze storiche lasciate come sono`);

  // — Piano —
  const tot = cambi.reduce((a, c) => a + c.varianti.length, 0);
  const md = [`# SKU resi unici dentro ogni negozio — ${new Date().toISOString().slice(0, 10)}`, "", `${applica ? "Applicato" : "Prova"}: ${cambi.length} prodotti, ${tot} varianti. Per tornare indietro: rimettere lo SKU della colonna «prima».`, ""];
  for (const n of negozi) {
    const miei = cambi.filter((c) => c.negozio === n.nome);
    const perStato: Record<string, number> = {};
    for (const c of miei) perStato[c.status] = (perStato[c.status] ?? 0) + 1;
    console.log(`\n=== ${n.nome}: ${miei.length} prodotti (${Object.entries(perStato).map(([s, k]) => `${s} ${k}`).join(", ")}), ${miei.reduce((a, c) => a + c.varianti.length, 0)} varianti`);
    for (const c of miei.filter((c) => c.status === "ACTIVE")) console.log(`  ATTIVO ${c.titolo} [${c.handle}] — ${c.motivo}: ${c.varianti.map((v) => `${v.titolo}: ${v.prima}→${v.dopo}`).join(", ")}`);
    md.push(`## ${n.nome} — ${miei.length} prodotti (${Object.entries(perStato).map(([s, k]) => `${s} ${k}`).join(", ")})`, "", "| Prodotto | Stato | Motivo | Variante | Prima | Dopo |", "|---|---|---|---|---|---|");
    for (const c of miei.sort((a, b) => (RANGO[a.status] ?? 9) - (RANGO[b.status] ?? 9))) for (const v of c.varianti) md.push(`| ${c.titolo.replace(/\|/g, "/")} \`${c.handle}\` | ${c.status} | ${c.motivo} | ${v.titolo.replace(/\|/g, "/")} | \`${v.prima}\` | \`${v.dopo}\` |`);
    md.push("");
  }
  if (!applica) {
    writeFileSync("docs/sku-unici-prova.md", md.join("\n") + "\n");
    console.log(`\nProva: ${cambi.length} prodotti, ${tot} varianti. Piano in docs/sku-unici-prova.md. Rilancia con --applica.`);
    await prisma.$disconnect();
    return;
  }

  // — Scrittura: negozio, poi database —
  // Il piano si scrive PRIMA di toccare i negozi: la prima esecuzione è morta a
  // metà di Flowers e, col piano scritto solo alla fine, di Cake e di mezza
  // Flowers non era rimasto scritto niente. Ogni prodotto è in try/catch: un
  // errore (limite di Shopify, database occupato) si annota e si va avanti.
  const file = `docs/sku-unici-${new Date().toISOString().slice(0, 10)}.md`;
  writeFileSync(file, md.join("\n") + "\n\n## Esito\n\n(in corso)\n");
  let okN = 0, errN = 0, okDb = 0;
  const esiti: string[] = [];
  for (const c of cambi) {
    const n = negozi.find((x) => x.nome === c.negozio)!;
    try {
      let r = await graphqlNegozio(n.dominio, n.token,
        `mutation($productId:ID!, $variants:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$productId, variants:$variants){ userErrors{ field message } } }`,
        { productId: c.prodottoId, variants: c.varianti.map((v) => ({ id: v.id, inventoryItem: { sku: v.dopo } })) });
      for (let t = 0; t < 4 && (r.status === 429 || r.corpo.errors?.some((e) => /throttl/i.test(e.message))); t++) {
        await attendi(3000 * (t + 1));
        r = await graphqlNegozio(n.dominio, n.token,
          `mutation($productId:ID!, $variants:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$productId, variants:$variants){ userErrors{ field message } } }`,
          { productId: c.prodottoId, variants: c.varianti.map((v) => ({ id: v.id, inventoryItem: { sku: v.dopo } })) });
      }
      const errori = erroriDi(r, "productVariantsBulkUpdate");
      if (errori.length) { errN++; esiti.push(`❌ ${c.negozio} · ${c.titolo}: ${errori.join("; ")}`); console.log(esiti[esiti.length - 1]); await attendi(500); continue; }
      okN++;
      const scheda = await prisma.prodotto.findFirst({ where: { shopifyId: c.prodottoId }, select: { varianti: { select: { id: true, nome: true, sku: true } } } });
      if (scheda) {
        for (const v of c.varianti) {
          const nome = v.titolo === "Default Title" ? "Unica" : v.titolo;
          const qui = scheda.varianti.find((x) => x.nome === nome && (vuoto(x.sku) || chiave(x.sku!) === chiave(v.prima)));
          if (!qui) continue;
          try { await prisma.variante.update({ where: { id: qui.id }, data: { sku: v.dopo } }); okDb++; } catch { /* sku già preso qui: lo riempie la seconda passata */ }
        }
      }
    } catch (e) {
      errN++;
      esiti.push(`❌ ${c.negozio} · ${c.titolo}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
      console.log(esiti[esiti.length - 1]);
    }
    if ((okN + errN) % 20 === 0) console.log(`  … ${okN + errN}/${cambi.length}`);
    await attendi(400);
  }
  md.push("## Esito", "", `Negozi: ${okN} prodotti aggiornati, ${errN} errori. Database: ${okDb} varianti aggiornate.`, "", ...esiti.map((e) => `- ${e}`), "");
  writeFileSync(file, md.join("\n") + "\n");
  console.log(`\nNegozi: ${okN} ok, ${errN} errori · Database: ${okDb} varianti · piano in ${file}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

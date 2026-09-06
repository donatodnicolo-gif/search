// Allinea le **varianti di ogni scheda** a quelle del negozio, per SKU. Non
// cancella niente.
// 1) una variante qui che tiene uno SKU che sul negozio ha un altro titolo
//    viene **rinominata** (sul negozio «Media» è diventata «Grande»);
// 2) una variante vuota il cui SKU sul negozio è già tenuto da una sorella
//    della stessa scheda è una **riga doppia**: si elenca, non si tocca;
// 3) una variante vuota il cui SKU è libero lo prende;
// 4) una variante vuota il cui SKU è di un'ALTRA scheda si elenca (gemello con
//    due schede qui): non si forza.
//
//   npx tsx scripts/varianti-dal-negozio.ts            # prova
//   npx tsx scripts/varianti-dal-negozio.ts --applica

import { readFileSync, writeFileSync } from "node:fs";

type V = { id: string; sku: string | null; title: string; product: { id: string } };
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

  const perGid = new Map<string, { title: string; sku: string }[]>();
  for (const n of await negoziAttivi()) {
    let cursor: string | null = null;
    for (;;) {
      const r = await graphqlNegozio(n.dominio, n.token,
        `query($c:String){ productVariants(first:250, after:$c){ pageInfo{ hasNextPage endCursor } nodes{ id sku title product{ id } } } }`, { c: cursor });
      const errori = r.corpo.errors?.map((e) => e.message) ?? [];
      if (r.status === 429 || errori.some((e) => /throttl/i.test(e))) { await attendi(2500); continue; }
      if (errori.length || r.status !== 200) throw new Error(`${n.nome}: HTTP ${r.status} ${errori.join("; ")}`);
      const d = r.corpo.data?.productVariants as unknown as { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: V[] };
      for (const v of d.nodes) if (!vuoto(v.sku)) perGid.set(v.product.id, [...(perGid.get(v.product.id) ?? []), { title: v.title === "Default Title" ? "Unica" : v.title, sku: v.sku!.trim() }]);
      if (!d.pageInfo.hasNextPage) break;
      cursor = d.pageInfo.endCursor;
      await attendi(250);
    }
  }
  const schede = await prisma.prodotto.findMany({
    where: { shopifyId: { not: null } },
    select: { id: true, nome: true, shopifyId: true, varianti: { select: { id: true, nome: true, sku: true } } },
  });
  const tenitori = new Map<string, string>(); // sku → prodottoId
  for (const s of schede) for (const v of s.varianti) if (!vuoto(v.sku)) tenitori.set(chiave(v.sku!), s.id);

  const rinomina: { id: string; scheda: string; da: string; a: string }[] = [];
  const doppie: string[] = [];
  const riempi: { id: string; scheda: string; nome: string; sku: string }[] = [];
  const gemelli: { scheda: string; nome: string; sku: string; tenuto: string }[] = [];
  for (const s of schede) {
    const sh = perGid.get(s.shopifyId!);
    if (!sh) continue;
    const titoloPerSku = new Map(sh.map((x) => [chiave(x.sku), x.title]));
    const skuPerTitolo = new Map(sh.map((x) => [x.title, x.sku]));
    const nomiDopo = new Map<string, string>();
    for (const v of s.varianti) {
      const t = !vuoto(v.sku) ? titoloPerSku.get(chiave(v.sku!)) : undefined;
      nomiDopo.set(v.id, t ?? v.nome);
      if (t && t !== v.nome) rinomina.push({ id: v.id, scheda: s.nome, da: v.nome, a: t });
    }
    for (const v of s.varianti) {
      if (!vuoto(v.sku)) continue;
      const voluto = skuPerTitolo.get(v.nome);
      if (!voluto) continue;
      const chiTiene = tenitori.get(chiave(voluto));
      if (!chiTiene) { riempi.push({ id: v.id, scheda: s.nome, nome: v.nome, sku: voluto }); tenitori.set(chiave(voluto), s.id); continue; }
      if (chiTiene === s.id) {
        const sorella = s.varianti.find((x) => x.id !== v.id && !vuoto(x.sku) && chiave(x.sku!) === chiave(voluto));
        if (sorella && nomiDopo.get(sorella.id) === v.nome) doppie.push(`${s.nome} · ${v.nome}`);
        else gemelli.push({ scheda: s.nome, nome: v.nome, sku: voluto, tenuto: `${s.nome} · ${sorella?.nome ?? "?"} (stessa scheda, titolo diverso)` });
        continue;
      }
      const altra = schede.find((x) => x.id === chiTiene);
      gemelli.push({ scheda: s.nome, nome: v.nome, sku: voluto, tenuto: altra?.nome ?? chiTiene });
    }
  }
  console.log(`rinomina ${rinomina.length} · righe doppie (lasciate) ${doppie.length} · da riempire ${riempi.length} · gemelli/conflitti ${gemelli.length}`);
  for (const r of rinomina.slice(0, 8)) console.log(`  rinomina ${r.scheda}: «${r.da}» → «${r.a}»`);
  for (const t of doppie.slice(0, 6)) console.log(`  doppia ${t}`);
  for (const g of gemelli.slice(0, 8)) console.log(`  gemello ${g.scheda} · ${g.nome} vuole ${g.sku}, tenuto da ${g.tenuto}`);
  const md = [`# Varianti allineate al negozio — ${new Date().toISOString().slice(0, 10)}`, "", `${applica ? "Applicato" : "Prova"}: ${rinomina.length} rinomine, ${riempi.length} SKU riempiti, ${doppie.length} righe doppie lasciate, ${gemelli.length} conflitti lasciati. Niente cancellato.`, "",
    "## Rinomine (la variante tiene lo SKU che sul negozio ha questo titolo)", "", "| Scheda | Da | A |", "|---|---|---|", ...rinomina.map((r) => `| ${r.scheda} | ${r.da} | ${r.a} |`), "",
    "## SKU riempiti", "", ...riempi.map((r) => `- ${r.scheda} · ${r.nome} = \`${r.sku}\``), "",
    "## Righe doppie (una sorella con lo stesso titolo tiene già lo SKU) — lasciate", "", ...doppie.map((d) => `- ${d}`), "",
    "## Conflitti lasciati (gemelli con due schede qui)", "", ...gemelli.map((g) => `- ${g.scheda} · ${g.nome} vuole \`${g.sku}\`, tenuto da ${g.tenuto}`), ""];
  if (!applica) { writeFileSync("docs/varianti-dal-negozio-prova.md", md.join("\n") + "\n"); console.log("Prova: niente scritto."); await prisma.$disconnect(); return; }
  let ok = 0, conflitti = 0;
  for (const r of rinomina) { await prisma.variante.update({ where: { id: r.id }, data: { nome: r.a } }); ok++; }
  for (const r of riempi) { try { await prisma.variante.update({ where: { id: r.id }, data: { sku: r.sku } }); ok++; } catch { conflitti++; } }
  const restano = await prisma.variante.count({ where: { prodotto: { statoShopify: "ACTIVE" }, OR: [{ sku: null }, { sku: "" }] } });
  md.push("## Esito", "", `${ok} scritture, ${conflitti} riempimenti in conflitto; varianti ACTIVE senza sku ora: ${restano}.`, "");
  writeFileSync(`docs/varianti-dal-negozio-${new Date().toISOString().slice(0, 10)}.md`, md.join("\n") + "\n");
  console.log(`${ok} scritture, ${conflitti} conflitti, varianti ACTIVE senza sku ora: ${restano}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

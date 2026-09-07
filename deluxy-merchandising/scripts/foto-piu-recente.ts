// La scheda mostra la **foto più recente** fra i negozi che vendono quel
// prodotto, non quella dell'ultimo import che è passato.
//
// Il problema (misurato il 07/09/2026): lo stesso prodotto sta su più negozi
// (stesso handle) con foto caricate in momenti diversi, e `Prodotto.immagine`
// veniva riscritta dall'import di **ogni** negozio — quindi vinceva l'ultimo
// cron della notte, non la foto giusta. Con l'arrivo di «Business Deluxy»
// (04:15, l'ultimo) migliaia di schede hanno cominciato a mostrare foto vecchie
// di anni: «Semifreddo ai 3 cioccolati» aveva su Gifts una foto del 2022 e su
// Business Deluxy una del 2024.
//
// La regola: **vince la più recente**. Il CDN di Shopify mette in coda all'URL
// `?v=<epoch>`, che è il momento in cui quel file è stato caricato su quel
// negozio: si confronta quello. Senza `?v=` la foto vale 0, cioè perde contro
// qualunque foto datata (ma batte «nessuna foto»).
//
//   npx tsx scripts/foto-piu-recente.ts            # prova
//   npx tsx scripts/foto-piu-recente.ts --applica

import { readFileSync, writeFileSync } from "node:fs";

type P = { id: string; handle: string; title: string; status: string; featuredImage: { url: string } | null };
const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

// La regola («vince la più recente») sta in `src/lib/foto.ts` e la usa anche
// l'import notturno: qui non se ne scrive una seconda copia.
let versioneFoto: (url: string | null | undefined) => number;

async function main() {
  for (const line of readFileSync("./.env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
  ({ versioneFoto } = await import("../src/lib/foto"));
  const { negoziAttivi } = await import("../src/lib/negozi");
  const { graphqlNegozio } = await import("../src/lib/shopify-scrittura");
  const { prisma } = await import("../src/lib/db");
  const applica = process.argv.includes("--applica");

  // Tutti i prodotti dei negozi, per handle
  const perHandle = new Map<string, { negozio: string; url: string | null; gid: string; status: string }[]>();
  const perGid = new Map<string, { negozio: string; url: string | null }>();
  for (const n of await negoziAttivi()) {
    let c: string | null = null;
    let k = 0;
    for (;;) {
      const r = await graphqlNegozio(n.dominio, n.token,
        `query($c:String){ products(first:250, after:$c){ pageInfo{ hasNextPage endCursor } nodes{ id handle title status featuredImage{ url } } } }`, { c });
      const e = r.corpo.errors?.map((x) => x.message) ?? [];
      if (r.status === 429 || e.some((x) => /throttl/i.test(x))) { await attendi(2500); continue; }
      if (e.length || r.status !== 200) throw new Error(`${n.nome}: HTTP ${r.status} ${e.join("; ")}`);
      const d = r.corpo.data?.products as unknown as { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: P[] };
      for (const p of d.nodes) {
        const u = p.featuredImage?.url ?? null;
        perHandle.set(p.handle, [...(perHandle.get(p.handle) ?? []), { negozio: n.nome, url: u, gid: p.id, status: p.status }]);
        perGid.set(p.id, { negozio: n.nome, url: u });
        k++;
      }
      if (!d.pageInfo.hasNextPage) break;
      c = d.pageInfo.endCursor;
      await attendi(200);
    }
    console.log(`${n.nome}: ${k} prodotti letti`);
  }

  const schede = await prisma.prodotto.findMany({
    where: { shopifyId: { not: null } },
    select: { id: true, nome: true, immagine: true, shopifyId: true, handleShopify: true, statoShopify: true },
  });
  const cambi: { id: string; nome: string; da: string | null; a: string; daNegozio: string; aNegozio: string; attiva: boolean }[] = [];
  for (const s of schede) {
    const gruppo = perHandle.get(s.handleShopify ?? "");
    if (!gruppo || gruppo.length === 0) continue;
    // La migliore fra i negozi: preferisce chi è pubblicato, poi la più recente.
    const candidati = [...gruppo].sort((a, b) => {
      const attivo = (x: typeof a) => (x.status === "ACTIVE" ? 0 : x.status === "DRAFT" ? 1 : 2);
      return attivo(a) - attivo(b) || versioneFoto(b.url) - versioneFoto(a.url);
    });
    const migliore = candidati.find((c) => c.url);
    if (!migliore || !migliore.url) continue;
    if ((s.immagine ?? null) === migliore.url) continue;
    // Non si sostituisce una foto con una **più vecchia**: se quella che c'è è
    // già la più recente (o pari), si lascia — così il giro è idempotente.
    if (versioneFoto(s.immagine) >= versioneFoto(migliore.url)) continue;
    cambi.push({
      id: s.id, nome: s.nome, da: s.immagine, a: migliore.url,
      daNegozio: perGid.get(s.shopifyId!)?.negozio ?? "?", aNegozio: migliore.negozio,
      attiva: s.statoShopify === "ACTIVE",
    });
  }
  const attive = cambi.filter((c) => c.attiva).length;
  console.log(`\nSchede da aggiornare: ${cambi.length} (di cui pubblicate: ${attive})`);
  const perCoppia: Record<string, number> = {};
  for (const c of cambi) { const k = `${c.daNegozio} → ${c.aNegozio}`; perCoppia[k] = (perCoppia[k] ?? 0) + 1; }
  console.log("da → a:", JSON.stringify(perCoppia));
  for (const c of cambi.slice(0, 8)) console.log(`  ${c.nome}\n     prima (${c.daNegozio}): ${c.da}\n      dopo (${c.aNegozio}): ${c.a}`);

  const md = [`# Foto allineate alla più recente — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, "",
    `${applica ? "Applicato" : "Prova"}: ${cambi.length} schede (${attive} pubblicate). Regola: fra i negozi che hanno lo stesso handle vince il prodotto pubblicato con la foto dal \`?v=\` più alto. Per tornare indietro: colonna «prima».`, "",
    "| Prodotto | Da (negozio) | A (negozio) | Prima | Dopo |", "|---|---|---|---|---|",
    ...cambi.map((c) => `| ${c.nome.replace(/\|/g, "/")} | ${c.daNegozio} | ${c.aNegozio} | ${c.da ?? "∅"} | ${c.a} |`), ""];
  const file = `docs/foto-piu-recente-${new Date().toISOString().slice(0, 13).replace("T", "-")}.md`;
  writeFileSync(file, md.join("\n") + "\n");
  if (!applica) { console.log(`\nProva: niente scritto. Piano in ${file}`); await prisma.$disconnect(); return; }
  let ok = 0;
  for (let i = 0; i < cambi.length; i += 5) {
    await Promise.all(cambi.slice(i, i + 5).map(async (c) => { await prisma.prodotto.update({ where: { id: c.id }, data: { immagine: c.a } }); ok++; }));
  }
  writeFileSync(file, md.join("\n") + `\n## Esito\n\n${ok} schede aggiornate.\n`);
  console.log(`\n${ok} schede aggiornate · piano in ${file}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

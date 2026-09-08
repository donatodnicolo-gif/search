// **Quanti prodotti pubblicati hanno davvero le traduzioni**, lingua per lingua
// e negozio per negozio. Sola lettura: nessuna scrittura, nessuna chiamata all'AI.
//
// Perché serve (08/09/2026, utente: «dobbiamo fare anche le traduzioni usando
// l'AI ed essere sicuri ci siano poi per ogni prodotto che carico»): prima di
// spendere in traduzioni bisogna sapere **quante ne mancano davvero**. Un
// campione di 40 prodotti diceva «quasi tutti tradotti»: qui si contano tutti.
//
// Come: `translations(locale:)` con un **alias per lingua** in una query sola
// per pagina di prodotti (stessa tecnica di `traduzioni-shopify.ts`), così
// otto lingue costano una chiamata invece di otto.
//
//   npx tsx scripts/censimento-traduzioni.ts             # tutti i negozi
//   npx tsx scripts/censimento-traduzioni.ts Cake        # uno solo

import { readFileSync, writeFileSync } from "node:fs";

type Trad = { key: string; value: string | null };
type ProdottoApi = { id: string; title: string; handle: string; status: string } & Record<string, unknown>;

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** `zh-CN` non è un nome valido per un alias GraphQL: si normalizza. */
const alias = (codice: string) => "t_" + codice.replace(/[^a-zA-Z0-9]/g, "_");

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
  const { LINGUE_NEGOZIO } = await import("../src/lib/ai-traduzioni");

  const lingue = LINGUE_NEGOZIO.map((l) => l.codice);
  const scelti = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((s) => s.toLowerCase());
  const tutti = await negoziAttivi();
  const negozi = scelti.length ? tutti.filter((n) => scelti.includes(n.nome.toLowerCase())) : tutti;

  const campiTrad = lingue.map((l) => `${alias(l)}: translations(locale: "${l}") { key value }`).join("\n        ");
  const rapporto: Record<string, unknown> = {};
  const daFare: { negozio: string; gid: string; titolo: string; handle: string; mancanti: string[] }[] = [];

  for (const n of negozi) {
    const prodotti: { p: ProdottoApi; per: Record<string, Trad[]> }[] = [];
    let cursor: string | null = null;
    for (;;) {
      const r = await graphqlNegozio(n.dominio, n.token,
        `query($c:String){ products(first: 25, after: $c, query: "status:active") {
          pageInfo { hasNextPage endCursor }
          nodes { id title handle status ${campiTrad} }
        } }`, { c: cursor });
      const errori = r.corpo.errors?.map((e) => e.message) ?? [];
      if (r.status === 429 || errori.some((e) => /throttl/i.test(e))) { await attendi(3000); continue; }
      if (errori.length || r.status !== 200) throw new Error(`${n.nome}: HTTP ${r.status} ${errori.join("; ")}`);
      const d = r.corpo.data?.products as unknown as { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: ProdottoApi[] };
      for (const p of d.nodes) {
        const per: Record<string, Trad[]> = {};
        for (const l of lingue) per[l] = (p[alias(l)] as Trad[] | undefined) ?? [];
        prodotti.push({ p, per });
      }
      if (!d.pageInfo.hasNextPage) break;
      cursor = d.pageInfo.endCursor;
      await attendi(400);
    }

    const haTitolo = (t: Trad[]) => t.some((x) => x.key === "title" && x.value && x.value.trim() !== "");
    const haDescrizione = (t: Trad[]) => t.some((x) => x.key === "body_html" && x.value && x.value.trim() !== "");
    const perLingua: Record<string, { titolo: number; descrizione: number }> = {};
    for (const l of lingue) perLingua[l] = { titolo: 0, descrizione: 0 };
    let completi = 0, senzaNessuna = 0;
    for (const { p, per } of prodotti) {
      const mancanti: string[] = [];
      for (const l of lingue) {
        if (haTitolo(per[l])) perLingua[l].titolo++; else mancanti.push(l);
        if (haDescrizione(per[l])) perLingua[l].descrizione++;
      }
      if (mancanti.length === 0) completi++;
      else daFare.push({ negozio: n.nome, gid: p.id, titolo: p.title, handle: p.handle, mancanti });
      if (mancanti.length === lingue.length) senzaNessuna++;
    }
    rapporto[n.nome] = { prodottiAttivi: prodotti.length, completi, senzaNessunaLingua: senzaNessuna, perLingua };
    console.log(`\n=== ${n.nome}: ${prodotti.length} prodotti pubblicati`);
    console.log(`    con tutte e ${lingue.length} le lingue (titolo): ${completi} · senza nessuna: ${senzaNessuna} · da completare: ${prodotti.length - completi}`);
    console.log("    titolo tradotto per lingua: " + lingue.map((l) => `${l} ${perLingua[l].titolo}`).join(" · "));
    console.log("    descrizione tradotta:       " + lingue.map((l) => `${l} ${perLingua[l].descrizione}`).join(" · "));
  }

  const md = [`# Censimento traduzioni — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, "",
    `Prodotti **pubblicati** (ACTIVE) dei negozi collegati, otto lingue: ${lingue.join(", ")}. Sola lettura.`, "",
    "| Negozio | Pubblicati | Con tutte le lingue | Senza nessuna | Da completare |", "|---|---:|---:|---:|---:|"];
  for (const [nome, v] of Object.entries(rapporto)) {
    const x = v as { prodottiAttivi: number; completi: number; senzaNessunaLingua: number };
    md.push(`| ${nome} | ${x.prodottiAttivi} | ${x.completi} | ${x.senzaNessunaLingua} | ${x.prodottiAttivi - x.completi} |`);
  }
  md.push("", "## Da completare, prodotto per prodotto", "", "| Negozio | Prodotto | Handle | Lingue mancanti |", "|---|---|---|---|");
  for (const d of daFare) md.push(`| ${d.negozio} | ${d.titolo.replace(/\|/g, "/")} | \`${d.handle}\` | ${d.mancanti.join(", ")} |`);
  const file = `docs/censimento-traduzioni-${new Date().toISOString().slice(0, 13).replace("T", "-")}.md`;
  writeFileSync(file, md.join("\n") + "\n");
  writeFileSync("traduzioni-da-fare.json", JSON.stringify(daFare, null, 1));
  console.log(`\nTOTALE da completare: ${daFare.length} prodotti · rapporto in ${file}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

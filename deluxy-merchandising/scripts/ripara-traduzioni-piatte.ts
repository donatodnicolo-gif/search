// **Rifà le traduzioni che hanno perso i titoli delle sezioni.**
//
// 11/09/2026, segnalazione dell'utente con la schermata: su cakedesign.me la
// versione inglese di una torta è un paragrafo unico. Causa e misura stanno in
// `src/lib/traduzione-html.ts`; in breve: si traduceva il testo spogliato dei
// tag, e il tema costruisce **una tab per ogni `<h6>`**. Senza titoli, niente
// tab. Contate con `scripts/conta-traduzioni-mancanti.ts`: **307 schede
// attive** sui quattro negozi.
//
// Il rastrello notturno adesso le riprende da solo, ma a 20 per negozio per
// notte: questo è il giro a mano per non aspettare otto notti.
//
// Due precauzioni, perché qui si spende e si scrive su negozi veri:
// 1. **prova a secco di default** — senza `--applica` non chiama l'AI e non
//    scrive niente, dice solo quante sono e quali;
// 2. **tetto per giro** — `--max=N` (default 40).
//
//   npx tsx scripts/ripara-traduzioni-piatte.ts
//   npx tsx scripts/ripara-traduzioni-piatte.ts Cake --max=10
//   npx tsx scripts/ripara-traduzioni-piatte.ts Cake --max=10 --applica

import { negoziAttivi } from "../src/lib/negozi";
import { graphqlNegozio } from "../src/lib/shopify-scrittura";
import { lingueAttiveDi } from "../src/lib/traduzioni-automatiche";
import { traduciSchedaHtml } from "../src/lib/ai-traduzioni";
import { registraTraduzioniProdotto } from "../src/lib/shopify-traduzioni-scrittura";
import { haTitoliDiSezione } from "../src/lib/traduzione-html";

const alias = (c: string) => "t_" + c.replace(/[^a-zA-Z0-9]/g, "_");
const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

type DaRifare = { id: string; titolo: string; html: string; lingue: string[] };

async function main() {
  const args = process.argv.slice(2);
  const applica = args.includes("--applica");
  const max = Number((args.find((a) => a.startsWith("--max=")) ?? "--max=40").split("=")[1]) || 40;
  const chiesto = args.filter((a) => !a.startsWith("--"))[0]?.trim();

  const attivi = await negoziAttivi();
  const negozi = chiesto ? attivi.filter((n) => n.nome.toLowerCase() === chiesto.toLowerCase()) : attivi;
  if (negozi.length === 0) {
    console.error(chiesto ? `Nessun negozio attivo si chiama «${chiesto}».` : "Nessun negozio attivo.");
    process.exit(1);
  }

  for (const n of negozi) {
    const attive = await lingueAttiveDi(n);
    if (attive.length === 0) { console.log(`\n=== ${n.nome} === nessuna lingua attiva, salto.`); continue; }
    const campi = attive.map((l) => `${alias(l)}: translations(locale:"${l}"){ key value }`).join(" ");

    const daRifare: DaRifare[] = [];
    let esaminati = 0;
    let cursore: string | null = null;
    for (let pagina = 0; pagina < 400; pagina++) {
      const r = await graphqlNegozio(
        n.dominio,
        n.token,
        `query($c:String){ products(first: 100, after: $c, query: "status:active"){
           pageInfo { hasNextPage endCursor }
           nodes { id title descriptionHtml ${campi} }
         } }`,
        { c: cursore },
      );
      const d = r.corpo.data?.products as unknown as
        | { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: Record<string, unknown>[] }
        | undefined;
      if (!d) { console.log(`${n.nome}: lettura interrotta.`, JSON.stringify(r.corpo.errors ?? r.corpo).slice(0, 300)); break; }
      for (const p of d.nodes) {
        esaminati++;
        const html = (p.descriptionHtml as string) ?? "";
        // Dove nemmeno l'italiano ha i titoli non c'è niente da riparare: la
        // traduzione piatta è fedele all'originale.
        if (!haTitoliDiSezione(html)) continue;
        const lingue = attive.filter((l) => {
          const t = ((p[alias(l)] as { key: string; value: string | null }[] | undefined) ?? []);
          const corpo = t.find((x) => x.key === "body_html" && x.value?.trim());
          return !corpo || !haTitoliDiSezione(corpo.value as string);
        });
        if (lingue.length) daRifare.push({ id: p.id as string, titolo: p.title as string, html, lingue });
      }
      if (!d.pageInfo.hasNextPage) break;
      cursore = d.pageInfo.endCursor;
    }

    const lotto = daRifare.slice(0, max);
    console.log(`\n=== ${n.nome} === lingue: ${attive.join(", ")} · attivi ${esaminati} · da rifare ${daRifare.length} · questo giro ${lotto.length}`);
    if (lotto.length === 0) continue;
    if (!applica) {
      for (const p of lotto.slice(0, 10)) console.log(`  · ${p.titolo} — ${p.lingue.join(", ")}`);
      console.log("  (prova a secco: rilancia con --applica per scrivere davvero)");
      continue;
    }

    let fatti = 0, falliti = 0;
    for (const p of lotto) {
      const t = await traduciSchedaHtml({ titolo: p.titolo, html: p.html }, p.lingue);
      if (!t.ok) {
        falliti++;
        console.log(`  ❌ ${p.titolo}: ${t.errore}`);
        if (/401|quota|rate/i.test(t.errore)) { console.log("  Chiave o quota: mi fermo."); break; }
        await attendi(1000);
        continue;
      }
      if (t.avvisi?.length) for (const a of t.avvisi) console.log(`  ⚠️ ${p.titolo}: ${a}`);
      const w = await registraTraduzioniProdotto({ dominio: n.dominio, token: n.token }, p.id, t.traduzioni);
      if (w.errori.length) { falliti++; console.log(`  ❌ ${p.titolo}: ${w.errori.join("; ")}`); }
      else { fatti++; console.log(`  ✓ ${p.titolo}: ${w.scritte} voci`); }
      await attendi(500);
    }
    console.log(`  → rifatti ${fatti} · falliti ${falliti} · restano ${daRifare.length - fatti}`);
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

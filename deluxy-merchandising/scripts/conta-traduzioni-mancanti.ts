// **Quante schede sono senza traduzione, e quante l'hanno ma piatta.**
//
// 11/09/2026. L'utente ha segnalato due difetti diversi con due schermate:
// una scheda inglese che è un paragrafo unico (ha perso i titoli, quindi il
// tema non costruisce le tab) e una scheda che in inglese è ancora in
// italiano (traduzione assente). Prima di correggere serve sapere **quante
// sono**: il rastrello notturno esiste già da tre giorni, e se l'arretrato non
// cala il problema non è l'assenza di un comando.
//
// Non scrive niente. Uso:
//   npx tsx scripts/conta-traduzioni-mancanti.ts [Nome negozio]

import { negoziAttivi } from "../src/lib/negozi";
import { graphqlNegozio } from "../src/lib/shopify-scrittura";
import { lingueAttiveDi } from "../src/lib/traduzioni-automatiche";

const alias = (c: string) => "t_" + c.replace(/[^a-zA-Z0-9]/g, "_");

async function main() {
  const chiesto = process.argv[2]?.trim();
  const attivi = await negoziAttivi();
  const negozi = chiesto ? attivi.filter((n) => n.nome.toLowerCase() === chiesto.toLowerCase()) : attivi;
  if (negozi.length === 0) {
    console.error(chiesto ? `Nessun negozio attivo si chiama «${chiesto}».` : "Nessun negozio attivo.");
    process.exit(1);
  }

  for (const n of negozi) {
    const attive = await lingueAttiveDi(n);
    if (attive.length === 0) {
      console.log(`\n=== ${n.nome} ===\nNessuna lingua attiva riconosciuta.`);
      continue;
    }
    const campi = attive.map((l) => `${alias(l)}: translations(locale:"${l}"){ key value }`).join(" ");

    let attivi = 0;
    let senzaTitolo = 0;
    let senzaCorpo = 0;
    let corpoPiatto = 0;
    let corpoConTitoli = 0;
    let itConTitoli = 0;
    const esempiSenza: string[] = [];
    const esempiPiatti: string[] = [];

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
      if (!d) {
        console.log(`${n.nome}: lettura interrotta.`, JSON.stringify(r.corpo.errors ?? r.corpo).slice(0, 300));
        break;
      }
      for (const p of d.nodes) {
        attivi++;
        const titolo = p.title as string;
        const itHtml = (p.descriptionHtml as string) ?? "";
        const itTitoli = /<h[1-6][^>]*>/i.test(itHtml);
        if (itTitoli) itConTitoli++;
        // Basta una lingua attiva scoperta perché la scheda risulti non tradotta:
        // il cliente che apre quella lingua vede l'italiano.
        let mancaTitolo = false;
        let mancaCorpo = false;
        let piatto = false;
        let conTitoli = false;
        for (const l of attive) {
          const t = ((p[alias(l)] as { key: string; value: string | null }[] | undefined) ?? []);
          const tit = t.find((x) => x.key === "title" && x.value?.trim());
          const corpo = t.find((x) => x.key === "body_html" && x.value?.trim());
          if (!tit) mancaTitolo = true;
          if (!corpo) mancaCorpo = true;
          else if (/<h[1-6][^>]*>/i.test(corpo.value as string)) conTitoli = true;
          // «Piatto» ha senso solo se l'italiano i titoli ce li ha: dove non li
          // ha nemmeno l'originale non è la traduzione ad averli persi.
          else if (itTitoli) piatto = true;
        }
        if (mancaTitolo) { senzaTitolo++; if (esempiSenza.length < 5) esempiSenza.push(titolo); }
        if (mancaCorpo) senzaCorpo++;
        if (piatto) { corpoPiatto++; if (esempiPiatti.length < 5) esempiPiatti.push(titolo); }
        if (conTitoli) corpoConTitoli++;
      }
      if (!d.pageInfo.hasNextPage) break;
      cursore = d.pageInfo.endCursor;
    }

    console.log(`\n=== ${n.nome} === lingue attive: ${attive.join(", ")}`);
    console.log(`  prodotti attivi ..................... ${attivi}`);
    console.log(`  con titoli di sezione in italiano ... ${itConTitoli}`);
    console.log(`  SENZA titolo tradotto ............... ${senzaTitolo}${esempiSenza.length ? `  es.: ${esempiSenza.join(" · ")}` : ""}`);
    console.log(`  senza descrizione tradotta .......... ${senzaCorpo}`);
    console.log(`  descrizione tradotta PIATTA ......... ${corpoPiatto}${esempiPiatti.length ? `  es.: ${esempiPiatti.join(" · ")}` : ""}`);
    console.log(`  descrizione tradotta coi titoli ..... ${corpoConTitoli}`);
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });

// **Attiva sui negozi le lingue che l'app sa tradurre**, e subito dopo le
// riempie.
//
// Chiesto dall'utente l'08/09/2026 («attiva le altre lingue e riempi tutto»).
// Misurato lo stesso giorno: attive sono solo `en` su tutti e quattro i negozi,
// più `fr` su Flowers e `ru` su Gifts; le altre sei Shopify le rifiuta con
// «Locale is not a valid locale for the shop».
//
// ⚠️ **Serve lo scope `write_locales`, che oggi NON c'è su nessuno dei quattro
// token** (provato: «Access denied for shopLocaleEnable field»). Va aggiunto
// alle app Shopify come è stato fatto per `write_products`, poi si riconia il
// token con «Verifica ora» in `/impostazioni`. Senza, questo script dice cosa
// farebbe e si ferma: è il motivo per cui esiste la prova a secco.
//
// ⚠️ **Attivare una lingua è visibile ai clienti**: il selettore compare sul
// sito e le pagine non ancora tradotte si vedono nella lingua di partenza. Per
// questo lo script, con `--applica`, **traduce subito dopo aver attivato**:
// prima si apre la porta, poi si arreda la stanza, non il contrario.
//
//   npx tsx scripts/attiva-lingue.ts                 # prova: dice cosa farebbe
//   npx tsx scripts/attiva-lingue.ts Cake --applica  # attiva e riempie un negozio
//   npx tsx scripts/attiva-lingue.ts --applica       # tutti

import { readFileSync } from "node:fs";

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
  const { graphqlNegozio, erroriDi } = await import("../src/lib/shopify-scrittura");
  const { LINGUE_NEGOZIO } = await import("../src/lib/ai-traduzioni");
  const { lingueAttiveDi, completaTraduzioniDelNegozio } = await import("../src/lib/traduzioni-automatiche");

  const args = process.argv.slice(2);
  const applica = args.includes("--applica");
  const scelti = args.filter((a) => !a.startsWith("--")).map((s) => s.toLowerCase());
  const tutti = await negoziAttivi();
  const negozi = scelti.length ? tutti.filter((n) => scelti.includes(n.nome.toLowerCase())) : tutti;

  for (const n of negozi) {
    const attive = await lingueAttiveDi(n);
    const daAttivare = LINGUE_NEGOZIO.map((l) => l.codice).filter((l) => !attive.some((a) => a.toLowerCase() === l.toLowerCase()));
    console.log(`\n=== ${n.nome}: attive ${attive.join(", ") || "(nessuna)"} · da attivare ${daAttivare.join(", ") || "(nessuna)"}`);
    if (daAttivare.length === 0) continue;
    if (!applica) {
      console.log(`   (prova) attiverei ${daAttivare.length} lingue, poi tradurrei i prodotti scoperti.`);
      continue;
    }

    const accese: string[] = [];
    for (const codice of daAttivare) {
      const r = await graphqlNegozio(n.dominio, n.token,
        `mutation($locale:String!){ shopLocaleEnable(locale:$locale){ shopLocale{ locale published } userErrors{ field message } } }`,
        { locale: codice });
      const errori = erroriDi(r, "shopLocaleEnable");
      if (errori.length) {
        console.log(`   ❌ ${codice}: ${errori.join("; ").slice(0, 110)}`);
        // Il permesso manca per tutte allo stesso modo: inutile insistere.
        if (errori.some((e) => /write_locales|Access denied/i.test(e))) {
          console.log("   Manca lo scope `write_locales`: aggiungilo all'app Shopify e riconia il token da /impostazioni.");
          break;
        }
        continue;
      }
      accese.push(codice);
      console.log(`   ✓ ${codice} attivata`);
      await attendi(400);
    }
    if (accese.length === 0) continue;

    // **Pubblicare la lingua** è un secondo passo: attivata ma non pubblicata,
    // la lingua esiste nell'admin e non sul sito. Si fa solo se l'attivazione
    // è riuscita.
    for (const codice of accese) {
      const r = await graphqlNegozio(n.dominio, n.token,
        `mutation($locale:String!){ shopLocaleUpdate(locale:$locale, shopLocale:{ published: true }){ userErrors{ field message } } }`,
        { locale: codice });
      const errori = erroriDi(r, "shopLocaleUpdate");
      if (errori.length) console.log(`   ⚠️ ${codice}: attivata ma non pubblicata (${errori.join("; ").slice(0, 80)})`);
      await attendi(300);
    }

    // E subito il riempimento, perché una lingua accesa e vuota mostra al
    // cliente il testo italiano sotto una bandiera straniera.
    console.log(`   Riempio le traduzioni per ${n.nome}…`);
    for (let giro = 1; giro <= 40; giro++) {
      const e = await completaTraduzioniDelNegozio(n, 25);
      console.log(`   giro ${giro}: da tradurre ${e.daTradurre} · tradotti ${e.tradotti} · falliti ${e.falliti}`);
      if (e.messaggi.length) for (const m of e.messaggi.slice(0, 3)) console.log(`      ${m}`);
      if (e.daTradurre === 0 || e.tradotti === 0) break;
    }
  }
  console.log("\nFatto.");
}
main().catch((e) => { console.error(e); process.exit(1); });

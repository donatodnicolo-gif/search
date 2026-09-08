// **Traduce con l'AI i prodotti pubblicati a cui mancano le lingue** e scrive
// le traduzioni sul negozio.
//
// Chiesto l'08/09/2026 dall'utente: «dobbiamo fare anche le traduzioni usando
// l'AI ed essere sicuri ci siano poi per ogni prodotto che carico». Il modulo
// dell'app traduce già quello che nasce da lì; questo copre **il pregresso e
// tutto ciò che arriva dall'import**, che non traduce nulla.
//
// Si nutre di `traduzioni-da-fare.json`, scritto da `censimento-traduzioni.ts`
// (il censimento va rifatto prima, così si lavora su un elenco fresco).
//
// Tre precauzioni, perché qui si spende e si scrive su negozi veri:
//
// 1. **Prova a secco di default.** Senza `--applica` non chiama l'AI e non
//    scrive niente: dice quanti prodotti tratterebbe e quanto costano.
// 2. **Tetto obbligatorio.** `--max=N` limita i prodotti per giro (default 25):
//    un errore su un elenco di migliaia si paga a ogni riga, e conviene
//    accorgersene alla venticinquesima.
// 3. **Si riprende senza rifare.** Ogni prodotto tradotto finisce in
//    `docs/traduzioni-fatte.json`: rilanciando, chi c'è già viene saltato, così
//    un giro interrotto non ripaga il lavoro già pagato.
//
//   npx tsx scripts/traduci-mancanti.ts                      # prova, tutti
//   npx tsx scripts/traduci-mancanti.ts Cake --max=10        # prova, un negozio
//   npx tsx scripts/traduci-mancanti.ts Cake --max=10 --applica

import { existsSync, readFileSync, writeFileSync } from "node:fs";

type DaFare = { negozio: string; gid: string; titolo: string; handle: string; mancanti: string[] };
const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Prezzo indicativo di gpt-4o-mini (USD per milione di token), solo per dare un ordine di grandezza. */
const COSTO_INGRESSO = 0.15;
const COSTO_USCITA = 0.6;

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
  const { traduciScheda } = await import("../src/lib/ai-traduzioni");
  const { registraTraduzioniProdotto } = await import("../src/lib/shopify-traduzioni-scrittura");

  const args = process.argv.slice(2);
  const applica = args.includes("--applica");
  const max = Number((args.find((a) => a.startsWith("--max=")) ?? "--max=25").split("=")[1]) || 25;
  const scelti = args.filter((a) => !a.startsWith("--")).map((s) => s.toLowerCase());

  // **Le lingue attive di ciascun negozio, dedotte dai fatti.** Senza
  // `read_locales` non si possono chiedere a Shopify (08/09/2026: manca su tutti
  // e quattro i token), ma un locale non attivo **non può avere traduzioni** —
  // Shopify le rifiuta. Quindi le lingue che hanno già traduzioni su un campione
  // di prodotti sono, con certezza, lingue attive. Misurato: `en` su tutti,
  // più `fr` su Flowers e `ru` su Gifts. Chiedere le altre fa fallire l'intero
  // lotto con «Locale is not a valid locale for the shop».
  const lingueAttive = async (n: { nome: string; dominio: string; token: string }): Promise<string[]> => {
    const { LINGUE_NEGOZIO } = await import("../src/lib/ai-traduzioni");
    const codici = LINGUE_NEGOZIO.map((l) => l.codice);
    const campi = codici.map((l) => `t_${l.replace(/[^a-zA-Z0-9]/g, "_")}: translations(locale:"${l}"){ value }`).join(" ");
    const r = await graphqlNegozio(n.dominio, n.token, `{ products(first: 50, query:"status:active"){ nodes{ ${campi} } } }`, {});
    const nodi = ((r.corpo.data as unknown as { products?: { nodes: Record<string, unknown>[] } })?.products?.nodes) ?? [];
    const viste = codici.filter((l) =>
      nodi.some((p) => ((p[`t_${l.replace(/[^a-zA-Z0-9]/g, "_")}`] as { value: string | null }[] | undefined) ?? []).some((x) => x.value && x.value.trim()))
    );
    return viste;
  };

  if (!existsSync("traduzioni-da-fare.json")) throw new Error("Manca traduzioni-da-fare.json: lancia prima scripts/censimento-traduzioni.ts");
  const elenco = JSON.parse(readFileSync("traduzioni-da-fare.json", "utf8")) as DaFare[];
  const fatti = new Set<string>(existsSync("docs/traduzioni-fatte.json") ? (JSON.parse(readFileSync("docs/traduzioni-fatte.json", "utf8")) as string[]) : []);

  const negozi = await negoziAttivi();
  const inScope = elenco
    .filter((d) => (scelti.length ? scelti.includes(d.negozio.toLowerCase()) : true))
    .filter((d) => !fatti.has(d.gid));

  // Le lingue attive si chiedono **una volta per negozio** e **prima di
  // filtrare**: senza, l'elenco «da fare» conterebbe anche i prodotti a cui
  // mancano solo lingue che il negozio non ha — lavoro che non esiste, e una
  // stima di spesa gonfiata.
  const attivePerNegozio = new Map<string, string[]>();
  for (const nome of new Set(inScope.map((d) => d.negozio))) {
    const n = negozi.find((x) => x.nome === nome);
    if (!n) continue;
    const att = await lingueAttive(n);
    attivePerNegozio.set(nome, att);
    console.log(`lingue attive su ${nome}: ${att.join(", ") || "(nessuna)"}`);
  }
  const mancantiAttive = (d: DaFare) => {
    const attive = attivePerNegozio.get(d.negozio) ?? [];
    return d.mancanti.filter((l) => attive.some((a) => a.toLowerCase() === l.toLowerCase()));
  };

  const daFare = inScope.filter((d) => mancantiAttive(d).length > 0);
  const lotto = daFare.slice(0, max);
  const senzaLavoro = inScope.length - daFare.length;

  console.log(`In elenco: ${elenco.length} · già fatti prima: ${fatti.size} · **da fare davvero: ${daFare.length}** · questo giro: ${lotto.length}`);
  if (senzaLavoro > 0) console.log(`(${senzaLavoro} prodotti aspettano lingue che il loro negozio non ha ancora attivato: nulla da tradurre finché non si attivano su Shopify)`);
  if (lotto.length === 0) { console.log("Niente da tradurre."); return; }
  const stimaToken = lotto.length * (900 + 2600); // ingresso + uscita, misurati su schede tipiche
  const stimaCosto = (lotto.length * 900 * COSTO_INGRESSO + lotto.length * 2600 * COSTO_USCITA) / 1_000_000;
  console.log(`Stima indicativa: ~${Math.round(stimaToken / 1000)}k token, ~${stimaCosto.toFixed(2)} $ per questo giro (gpt-4o-mini).`);
  if (!applica) {
    console.log("\nProva: niente AI, niente scritture. I primi del lotto:");
    for (const d of lotto.slice(0, 10)) console.log(`  ${d.negozio} · ${d.titolo} — da tradurre: ${mancantiAttive(d).join(", ")}`);
    console.log("\nRilancia con --applica per tradurre davvero.");
    return;
  }

  let tradotti = 0, falliti = 0, scritteTot = 0;
  const esiti: string[] = [];
  for (const d of lotto) {
    const n = negozi.find((x) => x.nome === d.negozio);
    if (!n) { falliti++; esiti.push(`❌ ${d.titolo}: negozio «${d.negozio}» non attivo`); continue; }
    // Solo le lingue **attive sul negozio** e ancora **mancanti** su questo
    // prodotto: il resto sarebbe speso per farsi dire di no.
    const da = mancantiAttive(d);
    if (da.length === 0) { esiti.push(`· ${d.titolo}: nessuna lingua attiva da completare`); continue; }
    // Il testo da tradurre si rilegge **dal negozio**, non dal nostro catalogo:
    // è quello che il cliente vede, ed è la sola versione che conta.
    const r = await graphqlNegozio(n.dominio, n.token, `query($id:ID!){ node(id:$id){ ... on Product { title descriptionHtml } } }`, { id: d.gid });
    const nodo = (r.corpo.data as unknown as { node?: { title: string; descriptionHtml: string } | null })?.node;
    if (!nodo?.title) { falliti++; esiti.push(`❌ ${d.titolo}: il negozio non restituisce il prodotto`); continue; }
    const testo = nodo.descriptionHtml?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
    const t = await traduciScheda({ titolo: nodo.title, descrizione: testo }, da);
    if (!t.ok) {
      falliti++;
      esiti.push(`❌ ${d.titolo}: ${t.errore}`);
      console.log(`  ❌ ${d.titolo}: ${t.errore}`);
      // Una chiave rifiutata o un tetto di spesa raggiunto non migliorano
      // riprovando mille volte: si esce e lo si dice.
      if (/401|quota|rate/i.test(t.errore)) { console.log("Errore di chiave o quota: mi fermo qui."); break; }
      await attendi(1000);
      continue;
    }
    const w = await registraTraduzioniProdotto({ dominio: n.dominio, token: n.token }, d.gid, t.traduzioni);
    if (w.errori.length) { falliti++; esiti.push(`❌ ${d.titolo}: ${w.errori.join("; ")}`); console.log(`  ❌ ${d.titolo}: ${w.errori.join("; ")}`); }
    else {
      tradotti++; scritteTot += w.scritte;
      fatti.add(d.gid);
      console.log(`  ✓ ${d.negozio} · ${d.titolo}: ${t.traduzioni.map((x) => x.locale).join(", ")} · ${w.scritte} voci scritte`);
    }
    // Il file dei fatti si aggiorna a ogni prodotto: se il giro muore a metà,
    // quello che è stato pagato resta registrato.
    writeFileSync("docs/traduzioni-fatte.json", JSON.stringify([...fatti], null, 1));
    await attendi(600);
  }
  console.log(`\nTradotti ${tradotti} · falliti ${falliti} · voci scritte sui negozi ${scritteTot}`);
  for (const e of esiti.slice(0, 15)) console.log("  " + e);
  console.log(`Restano da fare: ${daFare.length - tradotti}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

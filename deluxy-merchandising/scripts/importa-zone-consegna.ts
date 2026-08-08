// **Riempie l'anagrafica dai metafield di Shopify**, senza rifare l'import
// intero delle collezioni.
//
// Su Shopify la disponibilità per città vive nel metafield
// `custom.nations_availability` («ITALY-MILAN(MI) ITALY-PAVIA(PV)…») e la città
// dichiarata in `custom.citta`. Nei tag no: lì convivono città, fornitori e
// occasioni — «Martesana Milano» è il nome di una pasticceria, non una città — e
// costruirci sopra una condizione dava risultati sbagliati.
//
// L'import delle collezioni li legge già, ma è un giro lungo che tocca tutto;
// questo script fa **solo** i due campi, sui prodotti che hanno già un id
// Shopify. Ripetibile: riscrive gli stessi valori senza effetti.
//
//   (dalla cartella deluxy-merchandising)
//   npx tsx scripts/importa-zone-consegna.ts --dry   ← solo il conto
//   npx tsx scripts/importa-zone-consegna.ts         ← scrive

import { readFileSync } from "node:fs";

async function main() {
  for (const line of readFileSync("./.env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
  const secco = process.argv.includes("--dry");

  const { prisma } = await import("../src/lib/db");
  const { negoziAttivi } = await import("../src/lib/negozi");
  const { graphqlNegozio } = await import("../src/lib/shopify-scrittura");
  const { zoneDa, cittaDa, siNoDa, interoDa, dataDa } = await import("../src/lib/shopify-collezioni");

  const negozi = await negoziAttivi();
  console.log("Negozi collegati:", negozi.map((n) => n.nome).join(", "));

  // **Si chiede a Shopify, non si indovina.** I prodotti stanno su un negozio
  // solo: si prova il primo e, se lì non c'è, gli altri — come fa lo script che
  // unisce i tipi.
  const prodotti = await prisma.prodotto.findMany({
    where: { shopifyId: { not: null } },
    select: { id: true, shopifyId: true, nome: true },
  });
  console.log(`Prodotti con id Shopify: ${prodotti.length}`);
  if (secco) return void (await prisma.$disconnect());

  // 50 per volta: `nodes` accetta una lista di id e costa molto meno di una
  // query per prodotto (4.600 chiamate diventano ~92).
  const A_GRUPPI = 50;
  let conZone = 0;
  let conCitta = 0;
  let visti = 0;
  for (let i = 0; i < prodotti.length; i += A_GRUPPI) {
    const gruppo = prodotti.slice(i, i + A_GRUPPI);
    type Meta = { value: string } | null;
    let nodi: {
      id: string; createdAt?: string | null; publishedAt?: string | null;
      zone?: Meta; citta?: Meta; occasioni?: Meta; tipologiaMeta?: Meta;
      classificazione?: Meta; dataMeta?: Meta; orario?: Meta; bestSeller?: Meta; minimoOrario?: Meta;
    }[] = [];
    for (const n of negozi) {
      const r = await graphqlNegozio(
        n.dominio,
        n.token,
        `query($ids: [ID!]!) {
           nodes(ids: $ids) {
             ... on Product {
               id
               createdAt
               publishedAt
               zone: metafield(namespace: "custom", key: "nations_availability") { value }
               citta: metafield(namespace: "custom", key: "citta") { value }
               occasioni: metafield(namespace: "custom", key: "occasioni") { value }
               tipologiaMeta: metafield(namespace: "custom", key: "tipologia") { value }
               classificazione: metafield(namespace: "custom", key: "classificazione") { value }
               dataMeta: metafield(namespace: "custom", key: "data") { value }
               orario: metafield(namespace: "custom", key: "orario_consegna") { value }
               bestSeller: metafield(namespace: "custom", key: "best_seller") { value }
               minimoOrario: metafield(namespace: "custom", key: "minimo_orario") { value }
             }
           }
         }`,
        { ids: gruppo.map((p) => p.shopifyId as string) },
      );
      const letti = ((r.corpo.data?.nodes ?? []) as typeof nodi).filter((x) => x?.id);
      // I prodotti di un altro negozio tornano null: si tiene il negozio che ne
      // ha riconosciuti di più invece di fermarsi al primo che risponde.
      if (letti.length > nodi.length) nodi = letti;
      if (nodi.length === gruppo.length) break;
    }

    for (const nodo of nodi) {
      const zone = zoneDa(nodo.zone?.value);
      const citta = cittaDa(nodo.citta?.value);
      if (zone) conZone++;
      if (citta) conCitta++;
      // Tre tentativi: su un giro lungo il pooler Supabase chiude la connessione
      // (P1017), ed è già successo due volte su script di questa lunghezza.
      for (let tentativo = 1; ; tentativo++) {
        try {
          await prisma.prodotto.updateMany({
            where: { shopifyId: nodo.id },
            data: {
              zoneConsegna: zone,
              cittaShopify: citta,
              occasioniShopify: cittaDa(nodo.occasioni?.value),
              tipologiaShopify: cittaDa(nodo.tipologiaMeta?.value),
              classificazioneShopify: cittaDa(nodo.classificazione?.value),
              dataShopify: cittaDa(nodo.dataMeta?.value),
              orarioShopify: cittaDa(nodo.orario?.value),
              bestSellerShopify: siNoDa(nodo.bestSeller?.value),
              minimoOrario: interoDa(nodo.minimoOrario?.value),
              pubblicatoIlShopify: dataDa(nodo.publishedAt),
              creatoIlShopify: dataDa(nodo.createdAt),
            },
          });
          break;
        } catch (e) {
          if (tentativo >= 3) throw e;
          await new Promise((r) => setTimeout(r, 1500 * tentativo));
        }
      }
    }
    visti += gruppo.length;
    if (i % (A_GRUPPI * 10) === 0) process.stdout.write(`\r  letti ${visti}/${prodotti.length}`);
  }
  console.log(`\r  letti ${visti}/${prodotti.length} · con zone: ${conZone} · con città: ${conCitta}`);

  const zone = await prisma.prodotto.findMany({
    where: { statoShopify: "ACTIVE", zoneConsegna: { not: null } },
    select: { zoneConsegna: true },
  });
  const conta = new Map<string, number>();
  for (const p of zone) for (const z of (p.zoneConsegna ?? "").split(",")) {
    const k = z.trim();
    if (k) conta.set(k, (conta.get(k) ?? 0) + 1);
  }
  console.log("\nZone più diffuse fra i prodotti attivi:");
  for (const [z, n] of [...conta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${z}  ${n}`);
  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

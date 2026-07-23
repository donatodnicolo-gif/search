// Scarica gli ordini da uno o più negozi Shopify e li salva nell'app.
// Serve un token Admin API per negozio (scope: read_orders, read_products).
//
//   npm run import:ordini -- --da 2026-01-01
//   npm run import:ordini -- --negozio deluxygifts --da 2026-06-01
//
// I negozi si configurano in .env, uno per riga:
//   SHOPIFY_NEGOZI=deluxygifts:gifts,deluxyflowers:flowers,cakedesignme:cake
//   SHOPIFY_TOKEN_DELUXYGIFTS=shpat_...
//   SHOPIFY_TOKEN_DELUXYFLOWERS=shpat_...
//   SHOPIFY_TOKEN_CAKEDESIGNME=shpat_...
// Idempotente: upsert su (negozio, id Shopify), rilanciarlo non duplica.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const VERSIONE_API = "2025-01";

const argomenti = process.argv.slice(2).filter((a) => a !== "--");
const valoreDi = (nome, predefinito = null) => {
  const i = argomenti.indexOf(`--${nome}`);
  return i >= 0 && argomenti[i + 1] ? argomenti[i + 1] : predefinito;
};
const da = valoreDi("da", new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10));
const soloNegozio = valoreDi("negozio");

// Elenco negozi: "handle:brand" separati da virgola
const negozi = (process.env.SHOPIFY_NEGOZI || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean)
  .map((v) => {
    const [handle, brand] = v.split(":");
    return { handle, brand: brand || "gifts" };
  })
  .filter((n) => !soloNegozio || n.handle === soloNegozio);

if (negozi.length === 0) {
  console.error("Nessun negozio configurato: imposta SHOPIFY_NEGOZI nel .env (es. deluxygifts:gifts,deluxyflowers:flowers).");
  process.exit(1);
}

const QUERY = `
query Ordini($cursor: String, $filtro: String!) {
  orders(first: 100, after: $cursor, query: $filtro, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name createdAt displayFinancialStatus cancelledAt
      currentTotalPriceSet { shopMoney { amount currencyCode } }
      currentSubtotalPriceSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      totalDiscountsSet { shopMoney { amount } }
      customer { displayName email }
      shippingAddress { city country }
      customerJourneySummary { lastVisit { source utmParameters { source campaign } } }
      lineItems(first: 40) { nodes {
        title sku vendor quantity
        product { productType }
        originalUnitPriceSet { shopMoney { amount } }
        discountedTotalSet { shopMoney { amount } }
      } }
    }
  }
}`;

// Categoria normalizzata: la stessa lingua usata da keywords e landing.
function categoriaDa(titolo, tipo) {
  const t = `${titolo} ${tipo ?? ""}`.toLowerCase();
  if (/selections|riconsegna|spedizion|delivery|extra|gift card/.test(t)) return 'servizio';
  // I fiori si riconoscono per primi: molti nomi d'autore contengono parole
  // che altrimenti finirebbero in dolci o vini (Dolce Vita, Champagne Rosé).
  if (/rose|fior|bouquet|peoni|ortens|girasol|orchide|pianta|cappellier|cesto|lavanda|monet|botticelli|hokusai|dal.|frida|munch|wagner|tchaikovsky|venere|giverny/.test(t)) return 'fiori';
  if (/tort|cake|crostata|millefoglie|tiramis|sacher|cheesecake|saint|essenza|alexander|favolosa|otello|gianduia|coccinella|primavera|cioccolat/.test(t)) return 'torte';
  if (/colazion|brunch/.test(t)) return 'colazioni';
  if (/pralin|mignon|macaron|dolci/.test(t)) return 'dolci';
  if (/palloncin|balloon/.test(t)) return 'palloncini';
  if (/vino|sommelier|prosecco|bollicine/.test(t)) return 'vini';
  return 'altro';
}

function statoDa(finanziario, annullato) {
  if (annullato) return "annullato";
  if (finanziario === "REFUNDED") return "rimborsato";
  if (finanziario === "PARTIALLY_REFUNDED") return "parzialmente_rimborsato";
  return "pagato";
}

const numero = (v) => (v == null ? null : Number(v));

async function importaNegozio({ handle, brand }) {
  const token = process.env[`SHOPIFY_TOKEN_${handle.toUpperCase().replace(/[^A-Z0-9]/g, "")}`];
  if (!token) {
    console.error(`  ⚠ token mancante per ${handle}: imposta SHOPIFY_TOKEN_${handle.toUpperCase()}`);
    return { nuovi: 0, aggiornati: 0 };
  }
  const url = `https://${handle}.myshopify.com/admin/api/${VERSIONE_API}/graphql.json`;
  let cursore = null;
  let nuovi = 0;
  let aggiornati = 0;
  let pagine = 0;

  for (;;) {
    const risposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: QUERY, variables: { cursor: cursore, filtro: `created_at:>=${da}` } }),
    });
    if (!risposta.ok) {
      console.error(`  ⚠ ${handle}: HTTP ${risposta.status} ${await risposta.text()}`);
      break;
    }
    const dati = await risposta.json();
    if (dati.errors) {
      console.error(`  ⚠ ${handle}:`, JSON.stringify(dati.errors).slice(0, 300));
      break;
    }
    const blocco = dati.data.orders;
    pagine++;

    for (const o of blocco.nodes) {
      const idEsterno = o.id.split("/").pop();
      const visita = o.customerJourneySummary?.lastVisit ?? null;
      const datiOrdine = {
        brand,
        numero: o.name,
        data: new Date(o.createdAt),
        totale: numero(o.currentTotalPriceSet?.shopMoney?.amount),
        netto: numero(o.currentSubtotalPriceSet?.shopMoney?.amount),
        spedizione: numero(o.totalShippingPriceSet?.shopMoney?.amount),
        sconto: numero(o.totalDiscountsSet?.shopMoney?.amount),
        valuta: o.currentTotalPriceSet?.shopMoney?.currencyCode ?? "EUR",
        stato: statoDa(o.displayFinancialStatus, o.cancelledAt),
        cliente: o.customer?.displayName ?? null,
        email: o.customer?.email ?? null,
        citta: o.shippingAddress?.city ?? null,
        paese: o.shippingAddress?.country ?? null,
        origine: visita?.source ?? null,
        utmSource: visita?.utmParameters?.source ?? null,
        utmCampagna: visita?.utmParameters?.campaign ?? null,
      };
      const esistente = await prisma.ordine.findUnique({
        where: { negozio_idEsterno: { negozio: handle, idEsterno } },
      });
      const righe = o.lineItems.nodes.map((r) => ({
        titolo: r.title,
        sku: r.sku ?? null,
        vendor: r.vendor || null,
        tipo: r.product?.productType ?? null,
        quantita: r.quantity ?? 1,
        prezzo: numero(r.originalUnitPriceSet?.shopMoney?.amount),
        totale: numero(r.discountedTotalSet?.shopMoney?.amount),
        categoria: categoriaDa(r.title, r.product?.productType),
      }));
      if (esistente) {
        await prisma.rigaOrdine.deleteMany({ where: { ordineId: esistente.id } });
        await prisma.ordine.update({
          where: { id: esistente.id },
          data: { ...datiOrdine, righe: { create: righe } },
        });
        aggiornati++;
      } else {
        await prisma.ordine.create({
          data: { negozio: handle, idEsterno, ...datiOrdine, righe: { create: righe } },
        });
        nuovi++;
      }
    }
    if (!blocco.pageInfo.hasNextPage) break;
    cursore = blocco.pageInfo.endCursor;
  }
  console.log(`  ${handle} (${brand}): ${nuovi} nuovi · ${aggiornati} aggiornati · ${pagine} pagine`);
  return { nuovi, aggiornati };
}

console.log(`Import ordini Shopify da ${da}`);
let totNuovi = 0;
let totAggiornati = 0;
for (const n of negozi) {
  const esito = await importaNegozio(n);
  totNuovi += esito.nuovi;
  totAggiornati += esito.aggiornati;
}
await prisma.registroEvento.create({
  data: {
    autore: "import",
    tipo: "import",
    entita: "ordine",
    titolo: `Import ordini Shopify da ${da}`,
    dettaglio: `${totNuovi} nuovi · ${totAggiornati} aggiornati · negozi: ${negozi.map((n) => n.handle).join(", ")}`,
  },
});
console.log(`Totale: ${totNuovi} nuovi, ${totAggiornati} aggiornati.`);
await prisma.$disconnect();

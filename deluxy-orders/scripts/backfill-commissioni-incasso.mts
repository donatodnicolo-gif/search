/**
 * BACKFILL — la commissione d'incasso REALE sugli ordini storici.
 *
 * Legge da Shopify le fee delle transazioni (Shopify Payments le espone al
 * centesimo, e cambiano per ORDINE: 1,8%, 1,9% o 3,6% a seconda della carta;
 * carte estere aggiungono il cambio) e le scrive su `commissioneIncassi` con
 * firma `commissioneDa='shopify'`. Da quel momento la stima della piattaforma
 * non puo' piu' sovrascriverle (guardia nel PATCH v1): IL REALE BATTE LA STIMA.
 *
 * Il conto e' lo STESSO della sincronizzazione (`commissioneDaTransazioni` in
 * src/lib/shopify.ts, funzione unica): questo script serve solo a raggiungere
 * gli ordini piu' vecchi della finestra del cron.
 *
 * USO (di default NON scrive)
 *   npx tsx scripts/backfill-commissioni-incasso.mts
 *   npx tsx scripts/backfill-commissioni-incasso.mts --applica
 */
import { PrismaClient } from "@prisma/client";
import { commissioneDaTransazioni, type TransazioneShopify } from "../src/lib/shopify";

const APPLICA = process.argv.includes("--applica");
const prisma = new PrismaClient();

const QUERY = `
query Commissioni($cursor: String) {
  orders(first: 50, after: $cursor, sortKey: CREATED_AT, reverse: true) {
    edges {
      cursor
      node {
        id
        name
        transactions(first: 10) {
          kind
          status
          amountSet {
            shopMoney { amount currencyCode }
            presentmentMoney { amount currencyCode }
          }
          fees { amount { amount currencyCode } }
        }
      }
    }
    pageInfo { hasNextPage }
  }
}`;

const negozi = await prisma.negozioShopify.findMany({
  where: { attivo: true },
  select: { brand: true, dominio: true, token: true },
});

// ⚠️ TUTTI gli ordini in UNA query: il database sta a Francoforte, e un giro
// per ordine (14.000 x ~100 ms) sono venti minuti di sola latenza.
const locali = new Map(
  (await prisma.ordine.findMany({ select: { id: true, orderId: true, numero: true, commissioneIncassi: true, commissioneDa: true } }))
    .map((o) => [o.orderId, o]),
);

let visti = 0, daScrivere = 0, scritti = 0, invariati = 0;
const esempi: string[] = [];

for (const negozio of negozi) {
  let cursor: string | null = null;
  let pagina = 0;
  for (;;) {
    pagina++;
    const res: Response = await fetch(`https://${negozio.dominio}/admin/api/2024-10/graphql.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": negozio.token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { cursor } }),
    });
    const corpo = (await res.json()) as {
      errors?: unknown;
      data?: { orders?: { edges?: { cursor: string; node: { id: string; name: string; transactions?: TransazioneShopify[] } }[]; pageInfo?: { hasNextPage?: boolean } } };
    };
    if (corpo.errors) {
      // Throttling: l'API a punti chiede una pausa, non un'uscita.
      const testo = JSON.stringify(corpo.errors);
      if (testo.includes("THROTTLED")) { await new Promise((r) => setTimeout(r, 2000)); pagina--; continue; }
      console.error(`${negozio.brand} pagina ${pagina}: ${testo.slice(0, 200)}`);
      break;
    }
    const edges = corpo.data?.orders?.edges ?? [];
    if (!edges.length) break;
    for (const { node } of edges) {
      visti++;
      const fee = commissioneDaTransazioni(node.transactions);
      if (fee == null) continue; // Shopify non la sa: non si tocca niente
      const locale = locali.get(node.id);
      if (!locale) continue;
      if (locale.commissioneDa === "shopify" && locale.commissioneIncassi != null && Math.abs(locale.commissioneIncassi - fee) <= 0.005) {
        invariati++;
        continue;
      }
      daScrivere++;
      if (esempi.length < 5) esempi.push(`${locale.numero}: ${locale.commissioneIncassi ?? "—"} (${locale.commissioneDa || "stima/vuoto"}) → ${fee} (shopify)`);
      if (APPLICA) {
        await prisma.ordine.update({
          where: { id: locale.id },
          data: { commissioneIncassi: fee, commissioneDa: "shopify" },
        });
        scritti++;
      }
    }
    if (visti % 1000 < 50) console.log(`  …${negozio.brand}: ${visti} visti, ${daScrivere} da scrivere`);
    if (!corpo.data?.orders?.pageInfo?.hasNextPage) break;
    cursor = edges[edges.length - 1].cursor;
  }
}

console.log(`\nOrdini visti: ${visti} · con fee reale da scrivere: ${daScrivere} · gia' allineati: ${invariati}`);
if (esempi.length) console.log("esempi:\n  " + esempi.join("\n  "));
console.log(APPLICA ? `Scritti: ${scritti}.` : "Simulazione: non ho scritto niente. Rilancia con --applica.");
await prisma.$disconnect();

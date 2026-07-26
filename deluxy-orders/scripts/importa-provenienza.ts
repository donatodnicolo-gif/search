// Riempie la PROVENIENZA DI MARKETING sugli ordini già importati.
//
// Perché uno script a parte invece di una sincronizzazione normale: la sync
// rilegge tutto di ogni ordine (righe comprese) e su 14.000 ordini è un'ora di
// lavoro. Qui si chiede a Shopify solo il percorso d'acquisto e si scrivono sei
// colonne: gli ordini nuovi la portano già con sé dalla sync di ogni notte,
// questo serve una volta sola per lo storico.
//
// Uso: npm run importa:provenienza            (tutti i negozi attivi)
//      npm run importa:provenienza -- Flowers (un negozio solo)
import { Prisma } from "@prisma/client";
import { prisma, tabella } from "../src/lib/db";
import { chiamataAdmin, tokenNegozio } from "../src/lib/shopify";
import { deduciCanale } from "../src/lib/marketing";

const QUERY = `
query Provenienza($cursor: String) {
  orders(first: 100, after: $cursor, sortKey: CREATED_AT, reverse: true) {
    edges {
      cursor
      node {
        id
        sourceName
        customerJourneySummary {
          firstVisit { source referrerUrl utmParameters { source medium campaign } }
        }
      }
    }
    pageInfo { hasNextPage }
  }
}`;

type Nodo = {
  id: string;
  sourceName: string | null;
  customerJourneySummary: {
    firstVisit: {
      source: string | null;
      referrerUrl: string | null;
      utmParameters: { source: string | null; medium: string | null; campaign: string | null } | null;
    } | null;
  } | null;
};

async function main() {
  const soloBrand = process.argv[2];
  const negozi = await prisma.negozioShopify.findMany({
    where: { attivo: true, ...(soloBrand ? { brand: soloBrand } : {}) },
    orderBy: { brand: "asc" },
  });
  if (negozi.length === 0) {
    console.log(soloBrand ? `Nessun negozio attivo con brand "${soloBrand}".` : "Nessun negozio attivo.");
    return;
  }

  for (const n of negozi) {
    const token = await tokenNegozio(n);
    let cursor: string | null = null;
    let visti = 0;
    let scritti = 0;
    const canali = new Map<string, number>();
    console.log(`\n=== ${n.brand}`);

    for (;;) {
      const dati = (await chiamataAdmin(n.dominio, token, QUERY, { cursor })) as {
        orders: { edges: { cursor: string; node: Nodo }[]; pageInfo: { hasNextPage: boolean } };
      };
      const edges = dati.orders.edges;
      if (edges.length === 0) break;

      // Solo gli ordini che abbiamo davvero in archivio, e solo quelli il cui
      // valore cambia: riscrivere righe identiche è lavoro sprecato sul
      // database condiviso.
      const perOrderId = new Map(
        edges.map(({ node }) => {
          const fv = node.customerJourneySummary?.firstVisit ?? null;
          const utm = fv?.utmParameters ?? null;
          const d = {
            sorgente: node.sourceName ?? null,
            visitaSorgente: fv?.source ?? fv?.referrerUrl ?? null,
            utmSource: utm?.source ?? null,
            utmMedium: utm?.medium ?? null,
            utmCampaign: utm?.campaign ?? null,
          };
          return [node.id, { ...d, canaleMarketing: deduciCanale(d) }];
        }),
      );

      const salvati = await prisma.ordine.findMany({
        where: { negozioId: n.id, orderId: { in: [...perOrderId.keys()] } },
        select: {
          id: true,
          orderId: true,
          sorgente: true,
          visitaSorgente: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          canaleMarketing: true,
        },
      });

      // Una scrittura sola per pagina, non una per ordine: con 11.640 ordini e
      // 130 ms di andata e ritorno verso il database, un update per riga sono
      // due ore e mezza. Con l'UPDATE ... FROM (VALUES …) sono minuti.
      const daScrivere: Prisma.Sql[] = [];
      for (const s of salvati) {
        visti++;
        const nuovo = perOrderId.get(s.orderId)!;
        const etichetta = nuovo.canaleMarketing || "(sconosciuto)";
        canali.set(etichetta, (canali.get(etichetta) ?? 0) + 1);
        const uguale =
          s.sorgente === nuovo.sorgente &&
          s.visitaSorgente === nuovo.visitaSorgente &&
          s.utmSource === nuovo.utmSource &&
          s.utmMedium === nuovo.utmMedium &&
          s.utmCampaign === nuovo.utmCampaign &&
          s.canaleMarketing === nuovo.canaleMarketing;
        if (uguale) continue;
        daScrivere.push(
          Prisma.sql`(${s.id}, ${nuovo.sorgente}, ${nuovo.visitaSorgente}, ${nuovo.utmSource}, ${nuovo.utmMedium}, ${nuovo.utmCampaign}, ${nuovo.canaleMarketing})`,
        );
      }

      if (daScrivere.length) {
        await prisma.$executeRaw`
          UPDATE ${tabella("Ordine")} AS o SET
            "sorgente" = v.sorgente,
            "visitaSorgente" = v."visitaSorgente",
            "utmSource" = v."utmSource",
            "utmMedium" = v."utmMedium",
            "utmCampaign" = v."utmCampaign",
            "canaleMarketing" = v."canaleMarketing"
          FROM (VALUES ${Prisma.join(daScrivere)})
            AS v(id, sorgente, "visitaSorgente", "utmSource", "utmMedium", "utmCampaign", "canaleMarketing")
          WHERE o."id" = v.id
        `;
        scritti += daScrivere.length;
      }

      process.stdout.write(`\r  ${visti} ordini letti, ${scritti} aggiornati`);
      if (!dati.orders.pageInfo.hasNextPage) break;
      cursor = edges.at(-1)!.cursor;
    }

    console.log(`\n  fatto: ${visti} ordini, ${scritti} aggiornati`);
    [...canali.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`    ${String(v).padStart(6)}  ${k}`));
  }

  await prisma.$disconnect();
}

main();

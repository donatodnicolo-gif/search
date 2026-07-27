// Riempie CHI MANDA (nome, città, provincia, paese) sugli ordini già importati,
// e ricalcola l'URGENZA di tutto l'archivio.
//
// Perché uno script a parte invece di una sincronizzazione normale: la sync
// rilegge tutto di ogni ordine, righe comprese, e su 14.000 ordini è un'ora di
// lavoro. Qui si chiede a Shopify solo l'indirizzo di fatturazione e si
// scrivono quattro colonne, una pagina alla volta. Gli ordini nuovi se lo
// portano dietro dalla sync di ogni notte: questo serve per lo storico.
//
// L'urgenza invece non chiede niente a Shopify — sono due date che abbiamo già
// — quindi si ricalcola con una query sola alla fine.
//
// Uso: npm run importa:mittente            (tutti i negozi attivi)
//      npm run importa:mittente -- Flowers (un negozio solo)
import { Prisma } from "@prisma/client";
import { prisma, tabella } from "../src/lib/db";
import { chiamataAdmin, tokenNegozio } from "../src/lib/shopify";
import { ricalcolaUrgenza } from "../src/lib/urgenza-ricalcolo";

const QUERY = `
query Mittenti($cursor: String) {
  orders(first: 100, after: $cursor, sortKey: CREATED_AT, reverse: true) {
    edges {
      cursor
      node {
        id
        billingAddress { name city province provinceCode countryCodeV2 }
      }
    }
    pageInfo { hasNextPage }
  }
}`;

type Nodo = {
  id: string;
  billingAddress: {
    name: string | null;
    city: string | null;
    province: string | null;
    provinceCode: string | null;
    countryCodeV2: string | null;
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
    const paesi = new Map<string, number>();
    console.log(`\n=== ${n.brand}`);

    for (;;) {
      const dati = (await chiamataAdmin(n.dominio, token, QUERY, { cursor })) as {
        orders: { edges: { cursor: string; node: Nodo }[]; pageInfo: { hasNextPage: boolean } };
      };
      const edges = dati.orders.edges;
      if (edges.length === 0) break;

      const perOrderId = new Map(
        edges.map(({ node }) => {
          const b = node.billingAddress;
          return [
            node.id,
            {
              mittenteNome: b?.name ?? null,
              mittenteCitta: b?.city ?? null,
              mittenteProvincia: b?.provinceCode ?? b?.province ?? null,
              mittentePaese: b?.countryCodeV2 ?? null,
            },
          ];
        }),
      );

      const salvati = await prisma.ordine.findMany({
        where: { negozioId: n.id, orderId: { in: [...perOrderId.keys()] } },
        select: {
          id: true,
          orderId: true,
          mittenteNome: true,
          mittenteCitta: true,
          mittenteProvincia: true,
          mittentePaese: true,
        },
      });

      // Una scrittura per pagina, non una per ordine: con 130 ms di andata e
      // ritorno verso il database, un update per riga sono ore.
      const daScrivere: Prisma.Sql[] = [];
      for (const s of salvati) {
        visti++;
        const nuovo = perOrderId.get(s.orderId)!;
        const etichetta = nuovo.mittentePaese ?? "(senza paese)";
        paesi.set(etichetta, (paesi.get(etichetta) ?? 0) + 1);
        const uguale =
          s.mittenteNome === nuovo.mittenteNome &&
          s.mittenteCitta === nuovo.mittenteCitta &&
          s.mittenteProvincia === nuovo.mittenteProvincia &&
          s.mittentePaese === nuovo.mittentePaese;
        if (uguale) continue;
        daScrivere.push(
          Prisma.sql`(${s.id}, ${nuovo.mittenteNome}, ${nuovo.mittenteCitta}, ${nuovo.mittenteProvincia}, ${nuovo.mittentePaese})`,
        );
      }

      if (daScrivere.length) {
        await prisma.$executeRaw`
          UPDATE ${tabella("Ordine")} AS o SET
            "mittenteNome" = v.nome,
            "mittenteCitta" = v.citta,
            "mittenteProvincia" = v.provincia,
            "mittentePaese" = v.paese
          FROM (VALUES ${Prisma.join(daScrivere)})
            AS v(id, nome, citta, provincia, paese)
          WHERE o."id" = v.id
        `;
        scritti += daScrivere.length;
      }

      process.stdout.write(`\r  ${visti} ordini letti, ${scritti} aggiornati`);
      if (!dati.orders.pageInfo.hasNextPage) break;
      cursor = edges.at(-1)!.cursor;
    }

    console.log(`\n  fatto: ${visti} ordini, ${scritti} aggiornati`);
    [...paesi.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .forEach(([k, v]) => console.log(`    ${String(v).padStart(6)}  ${k}`));
  }

  // L'urgenza non dipende da Shopify: due date che abbiamo già, una query sola.
  const esito = await ricalcolaUrgenza();
  console.log(`\nUrgenza ricalcolata su tutto l'archivio: ${esito.aggiornati} ordini cambiati.`);

  await prisma.$disconnect();
}

main();

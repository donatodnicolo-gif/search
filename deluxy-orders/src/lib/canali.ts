import { prisma, SCHEMA } from "./db";
import { CANALI, canale as canalePerChiave, nomeCanale } from "./marketing";

// QUANTO VALE OGNI CANALE DI PROVENIENZA.
//
// Il motore sta qui e non dentro una pagina o dentro una rotta, perché lo stesso
// conto lo leggono in due: la sezione **Marketing** dell'app e l'API
// `/api/v1/marketing` che usa l'app ADV. Due implementazioni degli stessi numeri
// divergono, e il giorno che divergono nessuno se ne accorge — semplicemente due
// schermate raccontano due storie.
//
// Tre cose da sapere prima di leggere questi numeri:
//
//  1. **attribuzione al PRIMO contatto**: il canale è la prima visita del
//     percorso che ha portato all'ordine, non l'ultimo clic. Chi ci ha trovati
//     con Google Ads e poi è tornato scrivendo l'indirizzo resta «Google Ads»;
//  2. **«nuovo o di ritorno» si conta su tutta la storia**, non dentro il
//     periodo: il primo ordine di un cliente può essere di due anni fa, e
//     tagliarlo fuori farebbe risultare «nuovo» il suo secondo ordine;
//  3. **quello che non si sa resta scritto**: gli ordini senza percorso finiscono
//     in «provenienza sconosciuta» e non vengono spalmati sugli altri canali.
//
// `lordo` è il totale Shopify: IVA e spedizione incluse. Annullati e rimborsati
// per intero stanno fuori, come in Analisi e in /api/v1/ricavi.

export type RigaCanale = {
  canale: string;
  nome: string;
  simbolo: string;
  pagato: boolean;
  ordini: number;
  lordo: number;
  primi: number;
  daRepeater: number;
  nonAttribuibili: number;
  clienti: number;
  mesi: number[]; // dodici caselle, il venduto di ogni mese
};

export type RigaCampagna = { campagna: string; canale: string; ordini: number; lordo: number; primi: number };

// Lo STRUMENTO da cui è arrivata la persona, come l'ha scritto il link:
// «klaviyo», «shopify_email», «adwords». Sta sotto il canale — Klaviyo *è*
// email — e serve a rispondere alla domanda che il canale da solo non regge:
// «quanto ci porta Klaviyo?».
export type RigaSorgente = { sorgente: string; canale: string; ordini: number; lordo: number; primi: number };

export type Vendite = {
  canali: RigaCanale[];
  campagne: RigaCampagna[];
  sorgenti: RigaSorgente[];
  totali: {
    ordini: number;
    lordo: number;
    primi: number;
    daRepeater: number;
    nonAttribuibili: number;
    // Quanti ordini portavano un link marcato (`utm_*`). Serve a leggere i
    // confronti fra periodi: se in un periodo i link non erano marcati e
    // nell'altro sì, un canale «cresce» perché è cambiato il modo di marcare i
    // link, non il mercato. È il numero che rende onesta una variazione.
    tracciati: number;
  };
  esclusi: { ordini: number; lordo: number };
};

// La chiave del cliente: la stessa di Clienti e dei repeater (email → telefono →
// nome). Se cambia lì, cambia qui: altrimenti «cliente nuovo» vuol dire due cose.
const CHIAVE = `COALESCE(
  NULLIF(LOWER(TRIM(o."clienteEmail")), ''),
  NULLIF(TRIM(o."clienteTelefono"), ''),
  NULLIF(LOWER(TRIM(o."clienteNome")), '')
)`;

function cte(brand: string | null): string {
  return `
    WITH base AS (
      SELECT o."id", o."data", o."brand", o."totale", o."annullatoIl", o."financialStatus",
             o."canaleMarketing", o."utmCampaign", o."utmSource", o."visitaSorgente",
             ${CHIAVE} AS chiave
        FROM "${SCHEMA}"."Ordine" o
    ),
    numerati AS (
      SELECT b.*,
             CASE WHEN b.chiave IS NULL THEN NULL ELSE
               COUNT(*) FILTER (WHERE b."annullatoIl" IS NULL)
                 OVER (PARTITION BY b.chiave ORDER BY b."data"
                       ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
             END AS precedenti
        FROM base b
    ),
    dentro AS (
      SELECT * FROM numerati
       WHERE "data" >= $1 AND "data" < $2
         AND "annullatoIl" IS NULL
         AND ("financialStatus" IS NULL OR "financialStatus" NOT IN ('REFUNDED','VOIDED'))
         ${brand ? `AND "brand" = $3` : ""}
    )`;
}

export async function venditePerCanale(da: Date, a: Date, brand: string | null): Promise<Vendite> {
  const parametri: unknown[] = brand ? [da, a, brand] : [da, a];

  const [righe, campagne, sorgenti, esclusi, tracciati] = await Promise.all([
    prisma.$queryRawUnsafe<
      { canale: string; mese: number; ordini: number; lordo: number; primi: number; daRepeater: number; nonAttribuibili: number; clienti: number }[]
    >(
      `${cte(brand)}
       SELECT COALESCE(NULLIF("canaleMarketing", ''), 'sconosciuto') AS canale,
              EXTRACT(MONTH FROM ("data" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome'))::int AS mese,
              COUNT(*)::int AS ordini,
              COALESCE(SUM("totale"), 0)::float8 AS lordo,
              COUNT(*) FILTER (WHERE precedenti = 0)::int AS primi,
              COUNT(*) FILTER (WHERE precedenti > 0)::int AS "daRepeater",
              COUNT(*) FILTER (WHERE precedenti IS NULL)::int AS "nonAttribuibili",
              COUNT(DISTINCT chiave)::int AS clienti
         FROM dentro
        GROUP BY 1, 2
        ORDER BY 1, 2`,
      ...parametri,
    ),
    prisma.$queryRawUnsafe<RigaCampagna[]>(
      `${cte(brand)}
       SELECT "utmCampaign" AS campagna,
              COALESCE(NULLIF("canaleMarketing", ''), 'sconosciuto') AS canale,
              COUNT(*)::int AS ordini,
              COALESCE(SUM("totale"), 0)::float8 AS lordo,
              COUNT(*) FILTER (WHERE precedenti = 0)::int AS primi
         FROM dentro
        WHERE "utmCampaign" IS NOT NULL AND "utmCampaign" <> ''
        GROUP BY 1, 2
        ORDER BY 4 DESC
        LIMIT 50`,
      ...parametri,
    ),
    // Lo strumento vero, dal link: `utm_source` quando c'è, altrimenti il sito da
    // cui è arrivata la persona. Senza questa riga «Klaviyo» sarebbe invisibile,
    // sepolto dentro «Email» insieme a Shopify Email e alle newsletter.
    prisma.$queryRawUnsafe<RigaSorgente[]>(
      `${cte(brand)}
       SELECT LOWER(COALESCE(NULLIF(TRIM("utmSource"), ''), NULLIF(TRIM("visitaSorgente"), ''), '(non indicata)')) AS sorgente,
              COALESCE(NULLIF("canaleMarketing", ''), 'sconosciuto') AS canale,
              COUNT(*)::int AS ordini,
              COALESCE(SUM("totale"), 0)::float8 AS lordo,
              COUNT(*) FILTER (WHERE precedenti = 0)::int AS primi
         FROM dentro
        GROUP BY 1, 2
        ORDER BY 4 DESC
        LIMIT 60`,
      ...parametri,
    ),
    prisma.ordine.aggregate({
      where: {
        data: { gte: da, lt: a },
        ...(brand ? { brand } : {}),
        OR: [{ annullatoIl: { not: null } }, { financialStatus: { in: ["REFUNDED", "VOIDED"] } }],
      },
      _count: { _all: true },
      _sum: { totale: true },
    }),
    prisma.$queryRawUnsafe<{ tracciati: number }[]>(
      `${cte(brand)}
       SELECT COUNT(*) FILTER (WHERE COALESCE(TRIM("utmSource"), '') <> '')::int AS tracciati FROM dentro`,
      ...parametri,
    ),
  ]);

  const perCanale = new Map<string, RigaCanale>();
  const totali = { ordini: 0, lordo: 0, primi: 0, daRepeater: 0, nonAttribuibili: 0, tracciati: tracciati[0]?.tracciati ?? 0 };

  for (const r of righe) {
    let c = perCanale.get(r.canale);
    if (!c) {
      const meta = canalePerChiave(r.canale);
      c = {
        canale: r.canale,
        nome: r.canale === "sconosciuto" ? "Provenienza sconosciuta" : nomeCanale(r.canale),
        simbolo: meta?.simbolo ?? "·",
        pagato: CANALI.find((x) => x.chiave === r.canale)?.pagato ?? false,
        ordini: 0,
        lordo: 0,
        primi: 0,
        daRepeater: 0,
        nonAttribuibili: 0,
        clienti: 0,
        mesi: Array(12).fill(0),
      };
      perCanale.set(r.canale, c);
    }
    c.mesi[r.mese - 1] += r.lordo;
    c.ordini += r.ordini;
    c.lordo += r.lordo;
    c.primi += r.primi;
    c.daRepeater += r.daRepeater;
    c.nonAttribuibili += r.nonAttribuibili;
    // ⚠️ I clienti distinti si sommano PER MESE: chi compra a gennaio e a marzo è
    // contato due volte. Il nome della colonna lo dice, e chi ha bisogno delle
    // persone vere le chiede a /api/v1/clienti.
    c.clienti += r.clienti;
    totali.ordini += r.ordini;
    totali.lordo += r.lordo;
    totali.primi += r.primi;
    totali.daRepeater += r.daRepeater;
    totali.nonAttribuibili += r.nonAttribuibili;
  }

  return {
    canali: [...perCanale.values()].sort((x, y) => y.lordo - x.lordo),
    campagne,
    sorgenti,
    totali,
    esclusi: { ordini: esclusi._count._all, lordo: esclusi._sum.totale ?? 0 },
  };
}

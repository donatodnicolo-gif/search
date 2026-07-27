import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { prisma, SCHEMA } from "@/lib/db";
import { CANALI, nomeCanale } from "@/lib/marketing";

// GET /api/v1/marketing — quanto vale ogni CANALE DI PROVENIENZA, e quanta
// parte di quel valore sono clienti nuovi invece che clienti che tornano.
//
// A cosa serve: l'app Marketing sa quanto ha SPESO per canale, qui trova quanto
// ha INCASSATO. E soprattutto trova il taglio che una dashboard pubblicitaria
// non sa dare — «di questi ordini, quanti sono di gente che avrebbe comprato
// comunque?»: un canale che porta solo clienti che tornavano già non sta
// acquistando niente, sta rifatturando la fedeltà.
//
// Perché aggregato e non a pagine di ordini: un anno sono migliaia di righe, e
// il conto per canale × mese lo sa fare il database in una passata sola.
//
// Parametri: anno (default: quello in corso) oppure da/a (date ISO); brand.
//
// COSA NON ENTRA NEL CONTO (come in /api/v1/ricavi, e per gli stessi motivi):
// gli ordini annullati — restano spesso «pagati», contarli gonfierebbe un
// incasso mai avvenuto — e i rimborsati o storni. I parzialmente rimborsati
// restano contati per intero, perché l'importo reso non esiste nel registro:
// si dichiara invece di stimarlo.
//
// `lordo` è il totale Shopify: IVA e spedizione INCLUSE.

type RigaCanale = {
  canale: string;
  mese: number;
  ordini: number;
  lordo: number;
  primi: number;
  daRepeater: number;
  nonAttribuibili: number;
  clienti: number;
};

type RigaCampagna = { campagna: string; canale: string; ordini: number; lordo: number; primi: number };

export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const anno = Number(p.get("anno")) || new Date().getUTCFullYear();
  const da = p.get("da")?.trim() || `${anno}-01-01`;
  const a = p.get("a")?.trim() || `${anno + 1}-01-01`;
  const brand = p.get("brand")?.trim() || null;

  const gte = new Date(`${da}T00:00:00+01:00`);
  const lt = new Date(`${a}T00:00:00+01:00`);

  // La numerazione degli ordini di ogni cliente si fa PRIMA di tagliare il
  // periodo: il primo ordine di un cliente può essere di due anni fa, e se lo
  // si tagliasse fuori il suo secondo ordine risulterebbe «cliente nuovo».
  // Con la finestra si conta, per ogni ordine, quanti ordini VALIDI lo
  // precedono per la stessa persona — la stessa regola della pagina Clienti.
  const CHIAVE = `COALESCE(
    NULLIF(LOWER(TRIM(o."clienteEmail")), ''),
    NULLIF(TRIM(o."clienteTelefono"), ''),
    NULLIF(LOWER(TRIM(o."clienteNome")), '')
  )`;

  const NUMERATI = `
    WITH base AS (
      SELECT o."id", o."data", o."brand", o."totale", o."annullatoIl", o."financialStatus",
             o."canaleMarketing", o."utmCampaign",
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

  const parametri = brand ? [gte, lt, brand] : [gte, lt];

  const [righe, campagne, esclusi] = await Promise.all([
    prisma.$queryRawUnsafe<RigaCanale[]>(
      `${NUMERATI}
       SELECT COALESCE(NULLIF("canaleMarketing", ''), 'sconosciuto') AS canale,
              EXTRACT(MONTH FROM ("data" AT TIME ZONE 'Europe/Rome'))::int AS mese,
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
    // Le campagne con un nome vero: è quello che si legge in una dashboard
    // pubblicitaria, e permette di riconciliare spesa e venduto riga per riga.
    prisma.$queryRawUnsafe<RigaCampagna[]>(
      `${NUMERATI}
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
    prisma.ordine.aggregate({
      where: {
        data: { gte, lt },
        ...(brand ? { brand } : {}),
        OR: [{ annullatoIl: { not: null } }, { financialStatus: { in: ["REFUNDED", "VOIDED"] } }],
      },
      _count: { _all: true },
      _sum: { totale: true },
    }),
  ]);

  // Righe canale × mese → un oggetto per canale, coi dodici mesi dentro.
  const perCanale = new Map<
    string,
    {
      canale: string;
      nome: string;
      pagato: boolean;
      ordini: number;
      lordo: number;
      primi: number;
      daRepeater: number;
      nonAttribuibili: number;
      clienti: number;
      mesi: number[];
    }
  >();
  const totali = { ordini: 0, lordo: 0, primi: 0, daRepeater: 0, nonAttribuibili: 0 };

  for (const r of righe) {
    let c = perCanale.get(r.canale);
    if (!c) {
      c = {
        canale: r.canale,
        nome: r.canale === "sconosciuto" ? "Provenienza sconosciuta" : nomeCanale(r.canale),
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
    // I clienti distinti si sommano PER MESE: la somma non è il numero di
    // persone diverse dell'anno (chi compra a gennaio e a marzo è contato due
    // volte). Il nome lo dice, e chi ha bisogno delle persone vere le chiede a
    // /api/v1/clienti.
    c.clienti += r.clienti;
    totali.ordini += r.ordini;
    totali.lordo += r.lordo;
    totali.primi += r.primi;
    totali.daRepeater += r.daRepeater;
    totali.nonAttribuibili += r.nonAttribuibili;
  }

  return NextResponse.json({
    anno,
    periodo: { da, a, fuso: "Europe/Rome" },
    brand: brand ?? null,
    criteri: {
      importo: "totale Shopify (IVA e spedizione incluse)",
      attribuzione:
        "primo contatto: la prima visita del percorso che ha portato all'ordine, non l'ultimo clic",
      annullatiInclusi: false,
      rimborsatiInclusi: false,
      // Che cosa significano davvero le tre colonne del taglio per cliente.
      primi: "ordini di chi non aveva mai comprato prima (clienti nuovi)",
      daRepeater: "ordini di chi aveva già comprato prima di questo",
      nonAttribuibili:
        "ordini senza email, telefono né nome: non si può dire se il cliente sia nuovo, e non si indovina",
      clientiPerMese: "somma dei clienti distinti di ogni mese: chi compra in due mesi è contato due volte",
    },
    canali: [...perCanale.values()].sort((x, y) => y.lordo - x.lordo),
    campagne: campagne.map((c) => ({ ...c, nomeCanale: nomeCanale(c.canale) })),
    totali,
    esclusi: {
      annullatiERimborsati: { ordini: esclusi._count._all, lordo: esclusi._sum.totale ?? 0 },
    },
  });
}

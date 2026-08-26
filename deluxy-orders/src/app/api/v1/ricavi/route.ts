import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { prisma, SCHEMA } from "@/lib/db";

// GET /api/v1/ricavi — venduto aggregato per brand e per mese (sola lettura).
//
// Serve alle app che ragionano per periodo e non per singolo ordine (Budgets
// usa questo endpoint per il consuntivo del canale D2C). Scorrere gli ordini a
// pagine di 200 per sommarli a valle sarebbe decine di chiamate per un anno:
// la somma la fa il database, che è l'unico posto dove il conto è già completo.
//
// Parametri: anno (default: anno in corso), oppure da/a (date ISO) per un
// periodo qualsiasi; brand per limitarsi a un negozio.
//
// COSA NON ENTRA NEL CONTO, e perché:
// - gli ordini ANNULLATI: un annullato resta spesso "pagato" (caso reale
//   #2565), quindi contarlo gonfierebbe il fatturato di un incasso mai
//   avvenuto. Come nel resto delle API, si escludono di default;
// - gli ordini RIMBORSATI o storni (REFUNDED, VOIDED): i soldi sono tornati al
//   cliente. Shopify tiene solo il totale dell'ordine, non l'importo
//   rimborsato, quindi un rimborso PARZIALE resta contato per intero: è
//   dichiarato qui sotto (`parzialmenteRimborsati`) invece di essere corretto a
//   caso.
// Chi ha bisogno del lordo pieno passa annullati=inclusi / rimborsati=inclusi.
// La risposta dichiara sempre cosa è stato escluso e per quanto: nessun numero
// sparisce in silenzio.
//
// `lordo` è il totale Shopify (totalPrice): IVA e spedizione INCLUSE. Chi
// confronta con un fatturato imponibile deve scorporare l'IVA a valle —
// l'aliquota non è nota qui (Shopify non la salva sull'ordine).
//
// Dal 26/08/2026 la risposta porta anche **l'economia della vendita** che la
// piattaforma consegne scrive sugli ordini (vedi schema, `primoMargine` e
// `feeVendita`): per brand e per mese la somma delle fee incassate dai partner
// come commissioni e del primo margine (pagato − valore prodotti, già ÷ 1,22 —
// questo sì al netto IVA, a differenza del lordo). Sono somme sugli ordini che
// HANNO il dato, e la copertura viaggia accanto (`ordiniConEconomia`,
// `lordoConEconomia`): chi legge deve poter dire «misurato su X ordini di Y»,
// non spacciare la somma parziale per il totale. Zero ordini col dato = i campi
// valgono 0 e la copertura lo dichiara: n.d., non zero.

// La tabella si qualifica con lo schema (`SCHEMA` da db.ts): Prisma lo mette da
// sé nelle query dei modelli ma NON in quelle grezze, e col pooler in modalità
// transazione capita una connessione senza `search_path` — sintomo, un
// «relation "Ordine" does not exist» a intermittenza su una query che il minuto
// prima funzionava. È già successo qui: un 500 isolato prima di questa riga.
const RIMBORSI = ["REFUNDED", "VOIDED"];

type Riga = {
  brand: string;
  mese: number;
  ordini: number;
  lordo: number;
  fee: number;
  primoMargine: number;
  conEconomia: number;
  lordoConEconomia: number;
};

export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const anno = Number(p.get("anno")) || new Date().getUTCFullYear();
  // Confini del periodo come date di calendario italiane: un ordine delle
  // 00:30 del 1° gennaio è di gennaio, non di dicembre.
  const da = p.get("da")?.trim() || `${anno}-01-01`;
  const a = p.get("a")?.trim() || `${anno + 1}-01-01`;
  const brand = p.get("brand")?.trim() || null;
  const conAnnullati = p.get("annullati")?.trim().toLowerCase() === "inclusi";
  const conRimborsati = p.get("rimborsati")?.trim().toLowerCase() === "inclusi";

  const dentro = { gte: new Date(`${da}T00:00:00+01:00`), lt: new Date(`${a}T00:00:00+01:00`) };
  const base = { data: dentro, ...(brand ? { brand } : {}) };

  const [righe, annullati, rimborsati, parziali] = await Promise.all([
    prisma.$queryRawUnsafe<Riga[]>(
      `SELECT brand,
              EXTRACT(MONTH FROM (data AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Rome'))::int AS mese,
              COUNT(*)::int AS ordini,
              COALESCE(SUM(totale), 0)::float8 AS lordo,
              COALESCE(SUM("feeVendita"), 0)::float8 AS fee,
              COALESCE(SUM("primoMargine"), 0)::float8 AS "primoMargine",
              COUNT("primoMargine")::int AS "conEconomia",
              COALESCE(SUM(totale) FILTER (WHERE "primoMargine" IS NOT NULL), 0)::float8 AS "lordoConEconomia"
         FROM "${SCHEMA}"."Ordine"
        WHERE data >= $1 AND data < $2
          ${brand ? "AND brand = $3" : ""}
          ${conAnnullati ? "" : `AND "annullatoIl" IS NULL`}
          ${conRimborsati ? "" : `AND ("financialStatus" IS NULL OR "financialStatus" NOT IN ('REFUNDED','VOIDED'))`}
        GROUP BY 1, 2
        ORDER BY 1, 2`,
      ...(brand ? [dentro.gte, dentro.lt, brand] : [dentro.gte, dentro.lt])
    ),
    prisma.ordine.aggregate({ where: { ...base, annullatoIl: { not: null } }, _count: { _all: true }, _sum: { totale: true } }),
    prisma.ordine.aggregate({ where: { ...base, annullatoIl: null, financialStatus: { in: RIMBORSI } }, _count: { _all: true }, _sum: { totale: true } }),
    prisma.ordine.aggregate({ where: { ...base, annullatoIl: null, financialStatus: "PARTIALLY_REFUNDED" }, _count: { _all: true }, _sum: { totale: true } }),
  ]);

  type Brand = {
    brand: string;
    ordini: number;
    lordo: number;
    mesi: number[];
    ordiniMese: number[];
    // L'economia della vendita (dalla piattaforma): somme sugli ordini che la
    // portano, con la copertura accanto — per il totale e mese per mese.
    fee: number;
    primoMargine: number;
    ordiniConEconomia: number;
    lordoConEconomia: number;
    feeMese: number[];
    primoMargineMese: number[];
    conEconomiaMese: number[];
    lordoConEconomiaMese: number[];
  };
  const perBrand = new Map<string, Brand>();
  const mesiTotali = Array(12).fill(0) as number[];
  let ordiniTotali = 0;
  let lordoTotale = 0;
  let feeTotale = 0;
  let primoMargineTotale = 0;
  let conEconomiaTotale = 0;
  let lordoConEconomiaTotale = 0;
  for (const r of righe) {
    let b = perBrand.get(r.brand);
    if (!b) {
      b = {
        brand: r.brand, ordini: 0, lordo: 0, mesi: Array(12).fill(0), ordiniMese: Array(12).fill(0),
        fee: 0, primoMargine: 0, ordiniConEconomia: 0, lordoConEconomia: 0,
        feeMese: Array(12).fill(0), primoMargineMese: Array(12).fill(0),
        conEconomiaMese: Array(12).fill(0), lordoConEconomiaMese: Array(12).fill(0),
      };
      perBrand.set(r.brand, b);
    }
    b.mesi[r.mese - 1] = r.lordo;
    b.ordiniMese[r.mese - 1] = r.ordini;
    b.feeMese[r.mese - 1] = r.fee;
    b.primoMargineMese[r.mese - 1] = r.primoMargine;
    b.conEconomiaMese[r.mese - 1] = r.conEconomia;
    b.lordoConEconomiaMese[r.mese - 1] = r.lordoConEconomia;
    b.ordini += r.ordini;
    b.lordo += r.lordo;
    b.fee += r.fee;
    b.primoMargine += r.primoMargine;
    b.ordiniConEconomia += r.conEconomia;
    b.lordoConEconomia += r.lordoConEconomia;
    mesiTotali[r.mese - 1] += r.lordo;
    ordiniTotali += r.ordini;
    lordoTotale += r.lordo;
    feeTotale += r.fee;
    primoMargineTotale += r.primoMargine;
    conEconomiaTotale += r.conEconomia;
    lordoConEconomiaTotale += r.lordoConEconomia;
  }

  return NextResponse.json({
    anno,
    periodo: { da, a, fuso: "Europe/Rome" },
    criteri: {
      annullatiInclusi: conAnnullati,
      rimborsatiInclusi: conRimborsati,
      // Esplicito: `lordo` è IVA e spedizione incluse, come su Shopify.
      importo: "totale Shopify (IVA e spedizione incluse)",
      // L'economia della vendita è il conto della piattaforma consegne,
      // scritto sull'ordine: fee lorde, primo margine già al netto IVA.
      economia: "fee = commissioni incassate dai partner (lorde); primoMargine = (pagato − valore prodotti) ÷ 1,22; somme sui soli ordini col dato, copertura in ordiniConEconomia/lordoConEconomia",
    },
    brand: [...perBrand.values()].sort((x, y) => y.lordo - x.lordo),
    totali: {
      ordini: ordiniTotali,
      lordo: lordoTotale,
      mesi: mesiTotali,
      fee: feeTotale,
      primoMargine: primoMargineTotale,
      ordiniConEconomia: conEconomiaTotale,
      lordoConEconomia: lordoConEconomiaTotale,
    },
    esclusi: {
      annullati: { ordini: annullati._count._all, lordo: annullati._sum.totale ?? 0 },
      rimborsati: { ordini: rimborsati._count._all, lordo: rimborsati._sum.totale ?? 0 },
      // Contati per intero nonostante il rimborso parziale: il dato dell'importo
      // rimborsato non esiste nel registro, quindi si dichiara invece di stimarlo.
      parzialmenteRimborsati: { ordini: parziali._count._all, lordo: parziali._sum.totale ?? 0, contati: true },
    },
  });
}

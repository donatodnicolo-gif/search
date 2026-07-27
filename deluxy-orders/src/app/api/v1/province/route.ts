import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { prisma, SCHEMA } from "@/lib/db";

// GET /api/v1/province — venduto aggregato per PROVINCIA di consegna.
//
// Serve a chi ragiona per territorio invece che per periodo: Deluxy Scout ci
// costruisce sopra la vista Province, dove accanto a «quanti partner abbiamo
// qui» sta «quanto vale qui». Senza questo endpoint bisognerebbe scorrere
// 14.000 ordini a pagine di 200 per rifare a valle una somma che il database
// sa già fare.
//
// COSA NON ENTRA NEL CONTO — le stesse regole di /api/v1/ricavi, perché due
// endpoint che contano il fatturato in modi diversi sono un modo sicuro per
// litigare sui numeri in riunione:
// - ordini ANNULLATI: un annullato resta spesso "pagato", contarlo gonfierebbe
//   un incasso mai avvenuto;
// - ordini RIMBORSATI o storni (REFUNDED, VOIDED): i soldi sono tornati al
//   cliente. Un rimborso PARZIALE resta contato per intero (Shopify non tiene
//   l'importo rimborsato): dichiarato, non corretto a caso.
// Chi vuole il lordo pieno passa annullati=inclusi / rimborsati=inclusi.
//
// ⚠️ LA PROVINCIA NON C'È SEMPRE. Su ~13.600 ordini italiani ne hanno una circa
// 10.300: il resto ha l'indirizzo senza provincia, e Shopify non la deduce.
// Quelli SENZA finiscono in `senzaProvincia` invece di sparire, altrimenti la
// somma delle province non torna col fatturato totale e sembra un errore.
// La provincia NON si indovina dal CAP o dalla città: sarebbe un'ipotesi
// travestita da dato, e qui si consegnano fiori a indirizzi veri.
//
// I valori sono quelli veri di Shopify: sigle di targa («MI»), ma anche
// scritture straniere («ENG»). Non si normalizzano qui — chi legge sa quali
// sono le province italiane (Scout ha `lib/province.ts`), l'API non inventa
// una geografia che nei dati non c'è.

const RIMBORSI = ["REFUNDED", "VOIDED"];

type Riga = { provincia: string; ordini: number; lordo: number; clienti: number };

export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const anno = p.get("anno")?.trim();
  // Senza `anno` né `da`/`a` si guarda TUTTO lo storico: per capire dove si
  // vende, tre anni di dati dicono più di dodici mesi.
  const da = p.get("da")?.trim() || (anno ? `${anno}-01-01` : null);
  const a = p.get("a")?.trim() || (anno ? `${Number(anno) + 1}-01-01` : null);
  const brand = p.get("brand")?.trim() || null;
  const conAnnullati = p.get("annullati")?.trim().toLowerCase() === "inclusi";
  const conRimborsati = p.get("rimborsati")?.trim().toLowerCase() === "inclusi";

  const filtri: string[] = [];
  const valori: unknown[] = [];
  if (da) {
    valori.push(new Date(`${da}T00:00:00+01:00`));
    filtri.push(`data >= $${valori.length}`);
  }
  if (a) {
    valori.push(new Date(`${a}T00:00:00+01:00`));
    filtri.push(`data < $${valori.length}`);
  }
  if (brand) {
    valori.push(brand);
    filtri.push(`brand = $${valori.length}`);
  }
  if (!conAnnullati) filtri.push(`"annullatoIl" IS NULL`);
  if (!conRimborsati)
    filtri.push(`("financialStatus" IS NULL OR "financialStatus" NOT IN ('REFUNDED','VOIDED'))`);
  const dove = filtri.length ? `WHERE ${filtri.join(" AND ")}` : "";

  // Lo schema si qualifica a mano: Prisma non lo mette nelle query grezze, e col
  // pooler in modalità transazione capita una connessione senza `search_path`
  // (sintomo: «relation "Ordine" does not exist» a intermittenza).
  const righe = await prisma.$queryRawUnsafe<Riga[]>(
    `SELECT UPPER(TRIM(provincia)) AS provincia,
            COUNT(*)::int AS ordini,
            COALESCE(SUM(totale), 0)::float8 AS lordo,
            COUNT(DISTINCT COALESCE("clienteEmail", id))::int AS clienti
       FROM "${SCHEMA}"."Ordine"
       ${dove}${dove ? " AND" : "WHERE"} provincia IS NOT NULL AND TRIM(provincia) <> ''
      GROUP BY 1
      ORDER BY 3 DESC`,
    ...valori,
  );

  const senza = await prisma.$queryRawUnsafe<{ ordini: number; lordo: number }[]>(
    `SELECT COUNT(*)::int AS ordini, COALESCE(SUM(totale), 0)::float8 AS lordo
       FROM "${SCHEMA}"."Ordine"
       ${dove}${dove ? " AND" : "WHERE"} (provincia IS NULL OR TRIM(provincia) = '')`,
    ...valori,
  );

  const totale = righe.reduce((s, r) => s + r.lordo, 0);

  return NextResponse.json({
    periodo: { da: da ?? "tutto lo storico", a: a ?? "oggi" },
    province: righe.map((r) => ({
      provincia: r.provincia,
      ordini: r.ordini,
      lordo: Math.round(r.lordo * 100) / 100,
      clienti: r.clienti,
    })),
    totaleProvince: Math.round(totale * 100) / 100,
    // Dichiarato, non nascosto: è la differenza fra questa somma e il fatturato
    // totale, e senza saperlo i conti sembrano sbagliati.
    senzaProvincia: {
      ordini: senza[0]?.ordini ?? 0,
      lordo: Math.round((senza[0]?.lordo ?? 0) * 100) / 100,
      nota: "Ordini il cui indirizzo non ha la provincia. Non è dedotta da CAP o città: sarebbe un'ipotesi travestita da dato.",
    },
    esclusi: {
      annullati: conAnnullati ? "inclusi" : "esclusi",
      rimborsati: conRimborsati ? "inclusi" : "esclusi",
    },
  });
}

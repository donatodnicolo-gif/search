import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { QUOTA_FORNITORE_DEFAULT } from "@/lib/controllo";

// GET /api/v1/margini — il **margine per brand**, misurato sugli ordini
// riconciliati (sola lettura).
//
// Nata per Budgets (24/08/2026, «orders dovrebbe avere le % di margine di ogni
// brand per gli ordini»): la quota unica (fornitore 60% → margine 40%) è la
// regola, ma le riconciliazioni dicono che i brand NON marginano uguale —
// deluxy.it sta sopra il 50%, Flowers sotto il 44% — e chi costruisce il conto
// economico deve poterlo leggere da qui, non ricopiarsi la regola piatta.
//
// **Come si misura**: sugli ordini che hanno il costo del fornitore scritto
// (`costoFornitore`, dalla riconciliazione con la banca o dal Customer
// Service), margine = 1 − Σ costo ÷ Σ totale. Gli altri ordini NON entrano nel
// conto: non hanno un costo, e inventarglielo con la quota di regola farebbe
// «misurare» la regola stessa.
//
// ⚠️ La risposta dichiara sempre la COPERTURA (ordini e lordo misurati sul
// totale): un margine misurato su 60 ordini di 804 è un'indicazione, non un
// censimento, e sta a chi legge decidere quanta fiducia dargli. Nascondere la
// copertura trasformerebbe un campione in una verità.
//
// Parametri: anno (default: anno in corso), oppure da/a (date ISO).
// Esclusi come in /ricavi: annullati e rimborsati — un ordine rimborsato ha
// margine negativo per definizione, ma non è il margine del listino.
export const dynamic = "force-dynamic";

const RIMBORSI = ["REFUNDED", "VOIDED"];

export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const anno = Number(p.get("anno")) || new Date().getUTCFullYear();
  const da = p.get("da")?.trim() || `${anno}-01-01`;
  const a = p.get("a")?.trim() || `${anno + 1}-01-01`;

  const base = {
    data: { gte: new Date(`${da}T00:00:00+01:00`), lt: new Date(`${a}T00:00:00+01:00`) },
    annullatoIl: null,
    financialStatus: { notIn: RIMBORSI },
  };

  const [tutti, misurati] = await Promise.all([
    prisma.ordine.groupBy({
      by: ["brand"],
      where: base,
      _count: { _all: true },
      _sum: { totale: true },
    }),
    prisma.ordine.groupBy({
      by: ["brand"],
      where: { ...base, costoFornitore: { not: null }, totale: { gt: 0 } },
      _count: { _all: true },
      _sum: { totale: true, costoFornitore: true },
    }),
  ]);

  const brand = tutti
    .map((t) => {
      const m = misurati.find((x) => x.brand === t.brand);
      const lordoMisurato = m?._sum.totale ?? 0;
      const costo = m?._sum.costoFornitore ?? 0;
      const margine = lordoMisurato > 0 ? (1 - costo / lordoMisurato) * 100 : null;
      return {
        brand: t.brand,
        ordini: t._count._all,
        lordo: t._sum.totale ?? 0,
        // La misura, e quanto ne copre.
        ordiniMisurati: m?._count._all ?? 0,
        lordoMisurato,
        costoFornitore: costo,
        // `null` = nessun ordine riconciliato: il margine non è zero, non si sa.
        margineMisurato: margine === null ? null : Math.round(margine * 10) / 10,
        coperturaPct:
          (t._sum.totale ?? 0) > 0 ? Math.round((lordoMisurato / (t._sum.totale ?? 1)) * 1000) / 10 : 0,
      };
    })
    .sort((x, y) => y.lordo - x.lordo);

  return NextResponse.json({
    anno,
    periodo: { da, a },
    brand,
    // La regola, per confronto e per i brand senza misura: la quota si cambia
    // in Impostazioni di Orders e vale come ripiego dichiarato.
    regola: {
      quotaFornitore: QUOTA_FORNITORE_DEFAULT,
      margine: 100 - QUOTA_FORNITORE_DEFAULT,
      dove: "Deluxy Orders → Impostazioni (controllo.quotaFornitore)",
    },
    nota:
      "Margine misurato SOLO sugli ordini con il costo del fornitore scritto (riconciliazione banca o Customer Service). La copertura è dichiarata: un campione piccolo è un'indicazione, non un censimento.",
  });
}

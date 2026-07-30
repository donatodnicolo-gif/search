import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida } from "@/lib/apiauth";

// API pubblica di SOLA LETTURA: il **controllo** che Finance ha già fatto sugli
// ordini — stato dell'incasso e costo pagato al fornitore.
//
//   GET /api/v1/ordini-controllo?page=1&limit=200
//   Filtri: solo=con-costo (gli ordini a cui è stato assegnato un costo)
//   Header: X-API-Key: <chiave>
//
// Serve a **Deluxy Orders** per ADOTTARE il lavoro già fatto qui invece di
// ricominciarlo: al 30/07/2026 sono 249 ordini con un costo fornitore
// registrato a mano (23.224,47 € su 43.754,83 € di ordini) e 1.484 ordini con
// uno stato d'incasso. Buttarli e ripartire da zero avrebbe voluto dire
// rifare a mano mesi di abbinamenti.
//
// L'ordine si identifica con `brand` + `orderId` (il gid Shopify): sono le due
// chiavi che Finance e Orders hanno in comune, perché gli ordini arrivano di là
// dal registro. Il `numero` (#1234) è in più, per leggere la risposta.

export async function GET(req: NextRequest) {
  if (!(await chiaveApiValida(req))) {
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit") ?? "200") || 200));
  const where = sp.get("solo")?.trim() === "con-costo" ? { pagatoFornitore: { not: null } } : {};

  const [totale, ordini] = await Promise.all([
    prisma.ordineShopify.count({ where }),
    prisma.ordineShopify.findMany({
      where,
      orderBy: [{ data: "desc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    totale,
    page,
    limit,
    pagine: Math.max(1, Math.ceil(totale / limit)),
    ordini: ordini.map((o) => ({
      brand: o.brand,
      orderId: o.orderId,
      numero: o.nome,
      totale: o.totale,
      gestione: o.gestione, // riconciliazione | partner | pagamento_esterno
      incasso: {
        stato: o.statoRicon, // da_riconciliare | riconciliato | incassato_gateway | ignorato
        movimentoId: o.transazioneId,
        riconciliatoIl: o.riconciliatoIl?.toISOString() ?? null,
      },
      costo: {
        importo: o.pagatoFornitore,
        fornitore: o.fornitoreNome,
        movimentoId: o.transazionePagamentoId,
        pagatoIl: o.pagatoIl?.toISOString() ?? null,
      },
    })),
  });
}

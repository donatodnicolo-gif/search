import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { whereOrdini, serializzaOrdine, INCLUDE_ORDINE } from "@/lib/ordini";

// GET /api/v1/ordini — elenco ordini per le altre app (sola lettura).
// Filtri (querystring): q, brand, stato (chiave), categoria, app (destinazione),
// etichetta, da, a, consegnaDa, consegnaA, pagamento.
// Paginazione: page (1..), limit (default 50, max 200).
//
// GLI ORDINI ANNULLATI NON ESCONO DA QUI. Un'app a valle che li ricevesse
// potrebbe lavorarli come validi — mandarli a un fornitore, conteggiarli nel
// fatturato — e un ordine annullato resta spesso "pagato", quindi non si
// riconosce dallo stato del pagamento. Chi ha bisogno anche di quelli lo chiede
// esplicitamente con `annullati=inclusi` (oppure `annullati=solo`).
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const where = whereOrdini(p);

  const annullati = p.get("annullati")?.trim().toLowerCase();
  if (annullati === "solo") where.annullatoIl = { not: null };
  else if (annullati !== "inclusi") where.annullatoIl = null;
  const page = Math.max(1, Number(p.get("page") ?? "1") || 1);
  const limit = Math.min(200, Math.max(1, Number(p.get("limit") ?? "50") || 50));

  const [totale, ordini] = await Promise.all([
    prisma.ordine.count({ where }),
    prisma.ordine.findMany({
      where,
      include: INCLUDE_ORDINE,
      orderBy: { data: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    totale,
    page,
    limit,
    pagine: Math.max(1, Math.ceil(totale / limit)),
    // esplicito, così chi consuma sa cosa NON sta ricevendo
    annullatiInclusi: annullati === "inclusi" || annullati === "solo",
    ordini: ordini.map(serializzaOrdine),
  });
}

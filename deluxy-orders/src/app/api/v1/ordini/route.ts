import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { whereOrdini, serializzaOrdine, INCLUDE_ORDINE } from "@/lib/ordini";

// GET /api/v1/ordini — elenco ordini per le altre app (sola lettura).
// Filtri (querystring): q, brand, stato (chiave), categoria, app (destinazione),
// etichetta, da, a. Paginazione: page (1..), limit (default 50, max 200).
// Le altre app lo usano per leggere gli ordini e la loro classificazione Deluxy.
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const where = whereOrdini(p);
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
    ordini: ordini.map(serializzaOrdine),
  });
}

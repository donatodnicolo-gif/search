import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { decodificaChiave, whereOrdiniCliente } from "@/lib/clienti";
import { serializzaOrdine, INCLUDE_ORDINE } from "@/lib/ordini";
import { ordinali } from "@/lib/repeater";
import { tipologiePerOrdini } from "@/lib/tipologia-cliente";

// GET /api/v1/clienti/{cliente}/ordini — gli ordini di UN cliente, precisi.
//
// Prima di questa rotta l'unico modo era `/api/v1/ordini?q=<email>`: una
// ricerca `contains`, che porta dentro anche omonimi e indirizzi simili. Qui il
// filtro è lo stesso COALESCE delle liste (email → telefono → nome), cioè
// esattamente gli ordini che compongono la scheda di quel cliente.
//
// `{cliente}` come nelle altre rotte: base64url della chiave, oppure l'email in
// chiaro. Gli annullati non escono (410 concettuale delle copie a valle), salvo
// `?annullati=inclusi`. Paginazione: page (1..), limit (default 50, max 200).
export async function GET(req: NextRequest, ctx: { params: Promise<{ cliente: string }> }) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const { cliente: codice } = await ctx.params;
  // Se contiene una @ è già una chiave leggibile: decodificarla la romperebbe.
  const chiave = codice.includes("@") ? decodeURIComponent(codice).trim().toLowerCase() : decodificaChiave(codice);

  const p = req.nextUrl.searchParams;
  const inclusi = p.get("annullati")?.trim().toLowerCase() === "inclusi";
  const where = { ...whereOrdiniCliente(chiave), ...(inclusi ? {} : { annullatoIl: null }) };
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

  const [tipologie, ordinaliOrdini] = await Promise.all([
    tipologiePerOrdini(ordini),
    ordinali(ordini.map((o) => o.id)),
  ]);

  return NextResponse.json({
    totale,
    page,
    limit,
    pagine: Math.max(1, Math.ceil(totale / limit)),
    annullatiInclusi: inclusi,
    ordini: ordini.map((o) => serializzaOrdine(o, tipologie, ordinaliOrdini)),
  });
}

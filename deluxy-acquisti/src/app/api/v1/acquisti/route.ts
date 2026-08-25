import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { serializzaAcquisto } from "@/lib/serializza";

// GET /api/v1/acquisti — elenco acquisti (sola lettura).
// Filtri opzionali: ?stato=…&fornitore=…&categoria=…&limit=100
export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;

  const sp = req.nextUrl.searchParams;
  const stato = sp.get("stato");
  const fornitore = sp.get("fornitore");
  const categoria = sp.get("categoria");
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit")) || 100));

  const acquisti = await prisma.acquisto.findMany({
    where: {
      ...(stato ? { stato } : {}),
      ...(categoria ? { categoria } : {}),
      ...(fornitore ? { fornitoreNome: { contains: fornitore, mode: "insensitive" } } : {}),
    },
    include: { movimenti: true },
    orderBy: { dataOrdine: "desc" },
    take: limit,
  });

  return NextResponse.json({ acquisti: acquisti.map(serializzaAcquisto) });
}

// POST /api/v1/acquisti — crea un acquisto (chiave con permesso di scrittura).
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Corpo JSON non valido.");
  }
  const descrizione = String(body.descrizione ?? "").trim();
  const fornitoreNome = String(body.fornitoreNome ?? "").trim();
  if (!descrizione || !fornitoreNome) {
    return erroreApi(400, "descrizione e fornitoreNome sono obbligatori.");
  }
  const imponibile = Number(body.imponibile) || 0;
  const iva = Number(body.iva) || 0;
  const totale = Number(body.totale) || imponibile + iva;

  const acquisto = await prisma.acquisto.create({
    data: {
      descrizione,
      fornitoreNome,
      fornitorePiva: body.fornitorePiva ? String(body.fornitorePiva) : null,
      fornitoreId: body.fornitoreId ? String(body.fornitoreId) : null,
      categoria: body.categoria ? String(body.categoria) : null,
      imponibile,
      iva,
      totale,
      valuta: body.valuta ? String(body.valuta) : "EUR",
      stato: body.stato ? String(body.stato) : "ordinato",
      numeroFattura: body.numeroFattura ? String(body.numeroFattura) : null,
      creatoDa: `api:${cliente.nome}`,
      extra: (body.extra as object) ?? undefined,
    },
    include: { movimenti: true },
  });

  return NextResponse.json({ acquisto: serializzaAcquisto(acquisto) }, { status: 201 });
}

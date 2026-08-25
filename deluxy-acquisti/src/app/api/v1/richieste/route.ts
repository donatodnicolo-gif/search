import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { serializzaRichiesta } from "@/lib/serializza";

// GET /api/v1/richieste — elenco richieste di acquisto (sola lettura).
// Filtri opzionali: ?stato=…&richiedente=…&limit=100
export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;

  const sp = req.nextUrl.searchParams;
  const stato = sp.get("stato");
  const richiedente = sp.get("richiedente");
  const limit = Math.min(500, Math.max(1, Number(sp.get("limit")) || 100));

  const richieste = await prisma.richiestaAcquisto.findMany({
    where: {
      ...(stato ? { stato } : {}),
      ...(richiedente ? { richiedenteEmail: { contains: richiedente, mode: "insensitive" } } : {}),
    },
    orderBy: { creataIl: "desc" },
    take: limit,
  });

  return NextResponse.json({ richieste: richieste.map(serializzaRichiesta) });
}

// POST /api/v1/richieste — un'altra app crea una richiesta di acquisto
// (chiave con permesso di scrittura). Es. la piattaforma consegne che segnala
// materiale mancante.
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Corpo JSON non valido.");
  }
  const titolo = String(body.titolo ?? "").trim();
  const richiedenteEmail = String(body.richiedenteEmail ?? "").trim();
  if (!titolo || !richiedenteEmail) {
    return erroreApi(400, "titolo e richiedenteEmail sono obbligatori.");
  }

  const richiesta = await prisma.richiestaAcquisto.create({
    data: {
      titolo,
      richiedenteEmail,
      richiedenteNome: body.richiedenteNome ? String(body.richiedenteNome) : null,
      descrizione: body.descrizione ? String(body.descrizione) : null,
      categoria: body.categoria ? String(body.categoria) : null,
      fornitoreSuggerito: body.fornitoreSuggerito ? String(body.fornitoreSuggerito) : null,
      importoStimato: body.importoStimato != null ? Number(body.importoStimato) : null,
      valuta: body.valuta ? String(body.valuta) : "EUR",
      priorita: body.priorita ? String(body.priorita) : "media",
      stato: "inviata",
      extra: { origine: cliente.nome, ...(body.extra as object) },
    },
  });

  return NextResponse.json({ richiesta: serializzaRichiesta(richiesta) }, { status: 201 });
}

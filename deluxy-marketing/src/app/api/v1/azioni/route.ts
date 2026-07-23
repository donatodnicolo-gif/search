import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { STATI_AZIONE_APERTI } from "@/lib/dominio";

// GET /api/v1/azioni?stato=&brand=&aperte=1&scadute=1 — elenco azioni con storia
export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;

  const p = req.nextUrl.searchParams;
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const azioni = await prisma.azione.findMany({
    where: {
      ...(p.get("stato") ? { stato: p.get("stato")! } : {}),
      ...(p.get("brand") ? { brand: p.get("brand")! } : {}),
      ...(p.get("aperte") ? { stato: { in: STATI_AZIONE_APERTI } } : {}),
      ...(p.get("scadute") ? { stato: { in: STATI_AZIONE_APERTI }, scadenza: { lt: oggi } } : {}),
    },
    orderBy: [{ scadenza: { sort: "asc", nulls: "last" } }, { creataIl: "desc" }],
    take: Number(p.get("limite") ?? 200),
    include: {
      eventi: { orderBy: { creatoIl: "asc" } },
      analisi: { select: { id: true, titolo: true } },
      campagna: { select: { id: true, nome: true } },
    },
  });
  return NextResponse.json({ azioni });
}

// POST /api/v1/azioni — crea un'azione.
// Body: { titolo*, descrizione?, brand?, canale?, priorita?, owner?, scadenza?, analisiId?, campagnaId?, fileDrive? }
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }
  if (!body.titolo) return erroreApi(400, "Campo obbligatorio: titolo");

  const azione = await prisma.azione.create({
    data: {
      titolo: String(body.titolo),
      descrizione: body.descrizione ?? null,
      brand: body.brand ?? "cross",
      canale: body.canale ?? null,
      priorita: body.priorita ?? "media",
      owner: body.owner ?? "ai",
      scadenza: body.scadenza ? new Date(body.scadenza) : null,
      analisiId: body.analisiId ?? null,
      campagnaId: body.campagnaId ?? null,
      fileDrive: body.fileDrive ?? null,
      eventi: { create: { tipo: "creazione", autore: cliente.nome, testo: body.nota ?? "Creata via API" } },
    },
  });
  return NextResponse.json({ azione }, { status: 201 });
}

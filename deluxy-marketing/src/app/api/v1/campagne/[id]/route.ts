import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { STATI_CAMPAGNA } from "@/lib/dominio";

// GET /api/v1/campagne/:id — scheda con tutte le metriche
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;
  const { id } = await ctx.params;
  const campagna = await prisma.campagna.findUnique({
    where: { id },
    include: {
      metriche: { orderBy: { data: "asc" } },
      azioni: { select: { id: true, titolo: true, stato: true, scadenza: true } },
    },
  });
  if (!campagna) return erroreApi(404, "Campagna non trovata");
  return NextResponse.json({ campagna });
}

// PATCH /api/v1/campagne/:id — aggiorna stato/campi
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;
  const { id } = await ctx.params;

  let body;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }
  if (body.stato && !(STATI_CAMPAGNA as readonly string[]).includes(body.stato)) {
    return erroreApi(400, `stato non valido: ${body.stato}`);
  }
  const esiste = await prisma.campagna.findUnique({ where: { id } });
  if (!esiste) return erroreApi(404, "Campagna non trovata");

  const campagna = await prisma.campagna.update({
    where: { id },
    data: {
      ...(body.nome ? { nome: String(body.nome) } : {}),
      ...(body.stato ? { stato: body.stato } : {}),
      ...(body.obiettivo !== undefined ? { obiettivo: body.obiettivo } : {}),
      ...(body.budgetGiornaliero !== undefined
        ? { budgetGiornaliero: body.budgetGiornaliero != null ? Number(body.budgetGiornaliero) : null }
        : {}),
      ...(body.inizio !== undefined ? { inizio: body.inizio ? new Date(body.inizio) : null } : {}),
      ...(body.fine !== undefined ? { fine: body.fine ? new Date(body.fine) : null } : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
    },
  });
  return NextResponse.json({ campagna });
}

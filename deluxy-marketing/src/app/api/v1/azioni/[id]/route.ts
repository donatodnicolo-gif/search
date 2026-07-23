import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { STATI_AZIONE } from "@/lib/dominio";

// GET /api/v1/azioni/:id — scheda completa con storia
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;
  const { id } = await ctx.params;
  const azione = await prisma.azione.findUnique({
    where: { id },
    include: {
      eventi: { orderBy: { creatoIl: "asc" } },
      analisi: { select: { id: true, titolo: true } },
      campagna: { select: { id: true, nome: true } },
    },
  });
  if (!azione) return erroreApi(404, "Azione non trovata");
  return NextResponse.json({ azione });
}

// PATCH /api/v1/azioni/:id — aggiorna stato/campi; il cambio stato finisce nella storia.
// Body: { stato?, esito?, scadenza?, priorita?, owner?, descrizione? }
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
  const azione = await prisma.azione.findUnique({ where: { id } });
  if (!azione) return erroreApi(404, "Azione non trovata");
  if (body.stato && !(STATI_AZIONE as readonly string[]).includes(body.stato)) {
    return erroreApi(400, `stato non valido: ${body.stato}`);
  }

  const aggiornata = await prisma.azione.update({
    where: { id },
    data: {
      ...(body.stato ? { stato: body.stato } : {}),
      ...(body.esito !== undefined ? { esito: body.esito } : {}),
      ...(body.scadenza !== undefined ? { scadenza: body.scadenza ? new Date(body.scadenza) : null } : {}),
      ...(body.priorita ? { priorita: body.priorita } : {}),
      ...(body.owner ? { owner: body.owner } : {}),
      ...(body.descrizione !== undefined ? { descrizione: body.descrizione } : {}),
      ...(body.stato && body.stato !== azione.stato
        ? {
            eventi: {
              create: { tipo: "stato", da: azione.stato, a: body.stato, autore: cliente.nome, testo: body.nota ?? null },
            },
          }
        : {}),
    },
    include: { eventi: { orderBy: { creatoIl: "asc" } } },
  });
  return NextResponse.json({ azione: aggiornata });
}

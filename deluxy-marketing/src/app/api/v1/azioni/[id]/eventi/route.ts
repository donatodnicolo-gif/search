import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

// POST /api/v1/azioni/:id/eventi — aggiunge feedback o nota alla storia.
// Body: { testo*, tipo?: "feedback" | "nota" }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;
  const { id } = await ctx.params;

  let body;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }
  if (!body.testo) return erroreApi(400, "Campo obbligatorio: testo");

  const azione = await prisma.azione.findUnique({ where: { id } });
  if (!azione) return erroreApi(404, "Azione non trovata");

  const evento = await prisma.eventoAzione.create({
    data: {
      azioneId: id,
      tipo: body.tipo === "nota" ? "nota" : "feedback",
      testo: String(body.testo),
      autore: cliente.nome,
    },
  });
  return NextResponse.json({ evento }, { status: 201 });
}

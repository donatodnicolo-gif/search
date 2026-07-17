import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { serializzaPartner, validaPartner } from "@/lib/partner-api";

const INCLUDE = { contatti: true } as const;

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/partners/:id — dettaglio (l'id può essere anche il platformId)
export async function GET(req: NextRequest, { params }: Params) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const { id } = await params;
  const partner =
    (await prisma.partner.findUnique({ where: { id }, include: INCLUDE })) ??
    (await prisma.partner.findUnique({ where: { platformId: id }, include: INCLUDE }));
  if (!partner) return erroreApi(404, "Anagrafica non trovata");
  return NextResponse.json(serializzaPartner(partner));
}

// PATCH /api/v1/partners/:id — aggiornamento parziale (richiede scrittura).
// Se il body contiene 'contatti', la lista sostituisce integralmente quella esistente.
export async function PATCH(req: NextRequest, { params }: Params) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }

  const risultato = validaPartner(body, false);
  if ("errore" in risultato) return erroreApi(400, risultato.errore);
  const { dati, contatti } = risultato;

  const esistente = await prisma.partner.findUnique({ where: { id } });
  if (!esistente) return erroreApi(404, "Anagrafica non trovata");

  const aggiornato = await prisma.partner.update({
    where: { id },
    data: {
      ...dati,
      contatti: contatti ? { deleteMany: {}, create: contatti } : undefined,
    },
    include: INCLUDE,
  });
  return NextResponse.json(serializzaPartner(aggiornato));
}

// DELETE /api/v1/partners/:id — disattivazione (soft delete: attivo=false).
// Nessuna cancellazione fisica: il registro è la fonte di verità storica.
export async function DELETE(req: NextRequest, { params }: Params) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;

  const { id } = await params;
  const esistente = await prisma.partner.findUnique({ where: { id } });
  if (!esistente) return erroreApi(404, "Anagrafica non trovata");

  const disattivato = await prisma.partner.update({
    where: { id },
    data: { attivo: false },
    include: INCLUDE,
  });
  return NextResponse.json(serializzaPartner(disattivato));
}

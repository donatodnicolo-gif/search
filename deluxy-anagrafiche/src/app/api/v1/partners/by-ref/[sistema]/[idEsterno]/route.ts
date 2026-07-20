import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { serializzaPartner } from "@/lib/partner-api";

const INCLUDE = { contatti: true, riferimenti: true } as const;

// GET /api/v1/partners/by-ref/:sistema/:idEsterno
// Risolve un partner dall'id che un'altra app usa internamente. È così che le
// app "parlano un'unica lingua di id": ognuna tiene il proprio, e chiede al
// registro chi sia. Es. /by-ref/partner/clx123 → l'anagrafica corrispondente.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sistema: string; idEsterno: string }> },
) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const { sistema, idEsterno } = await params;
  const ref = await prisma.riferimentoEsterno.findUnique({
    where: { sistema_idEsterno: { sistema: decodeURIComponent(sistema), idEsterno: decodeURIComponent(idEsterno) } },
    include: { partner: { include: INCLUDE } },
  });
  if (!ref) return erroreApi(404, "Nessuna anagrafica per questo riferimento");
  return NextResponse.json(serializzaPartner(ref.partner));
}

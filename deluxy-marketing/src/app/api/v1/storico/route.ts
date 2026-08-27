import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi , limiteRichiesto } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

// GET /api/v1/storico?entita=&da=AAAA-MM-GG&limite= — il registro delle modifiche.
// Le sessioni Claude lo leggono per sapere cosa è cambiato dall'ultima volta.
export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;
  const p = req.nextUrl.searchParams;
  const limite = limiteRichiesto(p.get("limite"), 200);
  if (limite == null) return erroreApi(400, "Il parametro 'limite' deve essere un numero.");
  const da = p.get("da");
  const eventi = await prisma.registroEvento.findMany({
    where: {
      ...(p.get("entita") ? { entita: p.get("entita")! } : {}),
      ...(da ? { creatoIl: { gte: new Date(da) } } : {}),
    },
    orderBy: { creatoIl: "desc" },
    take: limite,
  });
  return NextResponse.json({ eventi });
}

import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { statiOrdinati } from "@/lib/stati";

// GET /api/v1/stati — la pipeline degli stati (chiave, nome, colore, ordine,
// terminale). Serve alle altre app per interpretare lo stato di un ordine.
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;
  const stati = await statiOrdinati();
  return NextResponse.json({
    stati: stati.map((s) => ({
      chiave: s.chiave,
      nome: s.nome,
      colore: s.colore,
      ordine: s.ordine,
      predefinito: s.predefinito,
      terminale: s.terminale,
    })),
  });
}

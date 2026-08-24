import { NextRequest, NextResponse } from "next/server";
import { prodottiCS } from "@/lib/nuovo-ordine";

// Proxy per la UI: la ricerca nel catalogo del negozio passa dal server, così
// la chiave del Customer Service non arriva mai al browser. Protetta dalla
// sessione nel middleware (/api/interno/*).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const negozio = p.get("negozio")?.trim();
  const q = p.get("q")?.trim();
  if (!negozio || !q) return NextResponse.json({ errore: "Servono ?negozio= e ?q=" }, { status: 400 });

  const esito = await prodottiCS(negozio, q);
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 });
  return NextResponse.json(esito.dati, { headers: { "Cache-Control": "no-store" } });
}

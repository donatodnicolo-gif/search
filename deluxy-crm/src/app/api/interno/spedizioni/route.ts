import { NextRequest, NextResponse } from "next/server";
import { sessioneApiValida } from "@/lib/sessione-server";
import { spedizioniCS } from "@/lib/nuovo-ordine";

// Proxy per la UI: le voci di spedizione del negozio scelto. Protetta dalla
// sessione nel middleware (/api/interno/*).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Il middleware (Edge) controlla firma e scadenza; qui la revoca (password cambiata).
  if (!(await sessioneApiValida())) return NextResponse.json({ errore: "Sessione non più valida" }, { status: 401 });
  const negozio = req.nextUrl.searchParams.get("negozio")?.trim();
  if (!negozio) return NextResponse.json({ errore: "Serve ?negozio=" }, { status: 400 });

  const esito = await spedizioniCS(negozio);
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 });
  return NextResponse.json(esito.dati, { headers: { "Cache-Control": "no-store" } });
}

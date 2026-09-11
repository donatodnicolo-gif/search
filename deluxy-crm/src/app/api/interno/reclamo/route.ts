import { NextRequest, NextResponse } from "next/server";
import { sessioneApiValida } from "@/lib/sessione-server";
import { reclamo } from "@/lib/reclami";

// Il dettaglio di un reclamo (col suo filo di messaggi), letto dal Customer
// Service quando si apre la finestra: la pagina porta solo gli id, non le
// storie. Protetta dalla sessione (middleware + revoca).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await sessioneApiValida())) return NextResponse.json({ errore: "Sessione non più valida" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ errore: "Serve ?id=" }, { status: 400 });

  const esito = await reclamo(id);
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 });
  return NextResponse.json(esito.dati, { headers: { "Cache-Control": "no-store" } });
}

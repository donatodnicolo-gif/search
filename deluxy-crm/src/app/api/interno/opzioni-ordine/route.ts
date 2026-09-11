import { NextRequest, NextResponse } from "next/server";
import { sessioneApiValida } from "@/lib/sessione-server";
import { opzioniCS } from "@/lib/nuovo-ordine";

// Proxy per la UI del Nuovo ordine: TUTTE le opzioni che il Customer Service
// offre per quel negozio (fasce dagli orari del negozio, spedizioni usate,
// metodi di pagamento, IVA, campi facoltativi). Il CS è la casa di queste
// regole: qui si passa la sua risposta, non se ne tiene una copia.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await sessioneApiValida())) return NextResponse.json({ errore: "Sessione non più valida" }, { status: 401 });
  const negozio = req.nextUrl.searchParams.get("negozio")?.trim();
  if (!negozio) return NextResponse.json({ errore: "Serve ?negozio=" }, { status: 400 });

  const esito = await opzioniCS(negozio);
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 });
  return NextResponse.json(esito.dati, { headers: { "Cache-Control": "no-store" } });
}

import { NextRequest, NextResponse } from "next/server";
import { sessioneApiValida } from "@/lib/sessione-server";
import { ricorrenze } from "@/lib/orders";

// Il dettaglio di UNA ricorrenza, per il pop-up (Ricorrenze e Calendario):
// si legge da Orders solo quando qualcuno la apre, così una pagina con
// seicento voci non porta seicento dettagli nel payload. Orders non ha una
// rotta per id: si leggono le ricorrenze del cliente (cache 60 s) e si pesca.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await sessioneApiValida())) return NextResponse.json({ errore: "Sessione non più valida" }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const id = (p.get("id") ?? "").trim();
  const cliente = (p.get("cliente") ?? "").trim();
  if (!id || !cliente) return NextResponse.json({ errore: "Servono ?id= e ?cliente=" }, { status: 400 });
  const r = await ricorrenze({ cliente, stato: "tutti", limit: 200 });
  if (!r.ok) return NextResponse.json({ errore: r.errore }, { status: 502 });
  const ricorrenza = r.dati.eventi.find((e) => e.id === id);
  if (!ricorrenza) return NextResponse.json({ errore: "Ricorrenza non trovata (forse è stata fusa o tolta)." }, { status: 404 });
  return NextResponse.json({ ricorrenza }, { headers: { "Cache-Control": "no-store" } });
}

import { NextRequest, NextResponse } from "next/server";
import { sessioneApiValida } from "@/lib/sessione-server";
import { tariffeCS, type RichiestaTariffeCS } from "@/lib/nuovo-ordine";

// Proxy per la UI del Nuovo ordine: le tariffe di consegna che il SITO offre
// per questo carrello e questo indirizzo (più la stima fuori zona), calcolate
// dal Customer Service. POST perché servono indirizzo e righe.
export const dynamic = "force-dynamic";
export const maxDuration = 40;

export async function POST(req: NextRequest) {
  if (!(await sessioneApiValida())) return NextResponse.json({ errore: "Sessione non più valida" }, { status: 401 });
  let corpo: RichiestaTariffeCS;
  try {
    corpo = (await req.json()) as RichiestaTariffeCS;
  } catch {
    return NextResponse.json({ errore: "Corpo non valido" }, { status: 400 });
  }
  const esito = await tariffeCS(corpo);
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 });
  return NextResponse.json(esito.dati, { headers: { "Cache-Control": "no-store" } });
}

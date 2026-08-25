import { NextRequest, NextResponse } from "next/server";
import { estraiDaFattura, messaggioErroreAI } from "@/lib/ai";

// Estrae i campi contabili dal testo di una fattura incollata nella UI.
// Gate di sessione: /api/interno/* passa dal middleware (cookie del team).
export async function POST(req: NextRequest) {
  let testo = "";
  try {
    const body = await req.json();
    testo = String(body?.testo ?? "");
  } catch {
    return NextResponse.json({ errore: "Corpo non valido." }, { status: 400 });
  }
  if (!testo.trim()) return NextResponse.json({ errore: "Testo vuoto." }, { status: 400 });

  try {
    const fattura = await estraiDaFattura(testo);
    return NextResponse.json({ fattura });
  } catch (e) {
    return NextResponse.json({ errore: messaggioErroreAI(e) }, { status: 502 });
  }
}

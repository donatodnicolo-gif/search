import { NextRequest, NextResponse } from "next/server";
import { cercaAziendeHubspot, hubspotConfigurato } from "@/lib/hubspot";

// Ricerca companies HubSpot per il popup di riconciliazione (protetta dal
// cookie di sessione della UI, vedi middleware).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ dati: [] });
  if (!hubspotConfigurato()) {
    return NextResponse.json({ errore: "HUBSPOT_ACCESS_TOKEN non configurato" }, { status: 503 });
  }
  try {
    const dati = await cercaAziendeHubspot(q);
    return NextResponse.json({ dati });
  } catch (e) {
    return NextResponse.json(
      { errore: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

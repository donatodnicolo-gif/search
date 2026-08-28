import { NextRequest, NextResponse } from "next/server";
import { novitaDa } from "@/lib/novita";

export const dynamic = "force-dynamic";

// Cosa è successo da `?da=` in poi, per i riquadri in basso a destra.
// Libro UX&UI v1.4 §7 (sistema del Customer Service).
//
// Protetta dal ramo `/api/novita` del middleware: stessa sessione a cookie
// della UI (401 senza cookie valido).
//
// ⚠️ `da` è l'ora del SERVER della chiamata precedente, rimandata indietro
// tale e quale: nessuno confronta mai l'orologio del browser con quello del
// database (src/lib/novita.ts).
export async function GET(req: NextRequest) {
  const grezzo = req.nextUrl.searchParams.get("da");
  const da = grezzo ? new Date(grezzo) : null;
  return NextResponse.json(await novitaDa(da));
}

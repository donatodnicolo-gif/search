import { NextResponse } from "next/server";
import { sezioniDelMenu } from "@/lib/novita-sezioni";

export const dynamic = "force-dynamic";

// Per ogni voce di menu con arrivi esterni: la data della cosa più recente
// (per il pallino giallo) e quanto lavoro aspetta (per il numero).
// Libro UX&UI v1.4 §7 (sistema del Customer Service).
//
// Protetta dal ramo `/api/novita` del middleware: stessa sessione a cookie
// della UI (401 senza cookie valido), niente CORS, niente chiavi API — le
// chiavi sono per /api/v1, e questa non è un'API dello standard.
//
// ⚠️ Non sa niente di chi guarda: «visto» è una cosa del browser di quella
// persona, e tenerla sul server vorrebbe dire una tabella in più per un pallino.
export async function GET() {
  return NextResponse.json({ sezioni: await sezioniDelMenu() });
}

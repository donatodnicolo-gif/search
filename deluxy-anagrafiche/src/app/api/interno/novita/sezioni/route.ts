import { NextResponse } from "next/server";
import { sezioniDelMenu } from "@/lib/novita-sezioni";

export const dynamic = "force-dynamic";

// Per ogni voce di menu con arrivi esterni: la data della cosa più recente
// (per il pallino giallo) e quanto lavoro aspetta (per il numero).
// Libro UX&UI v1.4 §7 (sistema del Customer Service).
//
// Sta sotto /api/interno: stessa sessione a cookie della UI, verificata dal
// middleware (401 senza cookie valido) — come le altre rotte interne.
//
// ⚠️ Non sa niente di chi guarda: «visto» è una cosa del browser di quella
// persona, e tenerla sul server vorrebbe dire una tabella in più per un pallino.
export async function GET() {
  return NextResponse.json({ sezioni: await sezioniDelMenu() });
}

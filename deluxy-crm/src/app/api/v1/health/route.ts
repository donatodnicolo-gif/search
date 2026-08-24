import { NextResponse } from "next/server";

// Alias storico della convenzione: la salute vera è /api/health.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, servizio: "deluxy-crm" }, { headers: { "Cache-Control": "no-store" } });
}

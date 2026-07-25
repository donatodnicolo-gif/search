import { NextResponse } from "next/server";

// Sonda di salute pubblica (nessuna chiave). Utile per monitor/uptime.
export async function GET() {
  return NextResponse.json({ ok: true, app: "deluxy-orders", versione: "v1" });
}

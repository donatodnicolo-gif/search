import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, servizio: "deluxy-acquisti", versione: 1 });
}

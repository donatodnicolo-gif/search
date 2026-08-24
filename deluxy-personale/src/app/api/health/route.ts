import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Convenzione Deluxy: GET /api/health PUBBLICO (fuori dal middleware),
// no-store, con un SELECT 1 vero — è quello che legge la pagina Stato del Hub.

export const dynamic = "force-dynamic";

export async function GET() {
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }
  return NextResponse.json(
    { ok: database, app: "deluxy-personale", database },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cifraturaPronta } from "@/lib/crypto";

// GET /api/v1/health — aperta, ma non dice nulla di utile a un estraneo:
// niente numeri, niente nomi, solo se l'app è configurata e viva.

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
    {
      app: "deluxy-transactions",
      ok: database && cifraturaPronta(),
      database,
      cifratura: cifraturaPronta(),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

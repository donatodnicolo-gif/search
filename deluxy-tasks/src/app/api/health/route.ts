import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Health-check pubblico, standard per tutte le app Deluxy: dice se il server
// risponde e se il database è raggiungibile davvero (un `SELECT 1`, non i
// dati). Lo legge la pagina /stato del Hub, che senza questo endpoint segnava
// Tasks come «non verificato». Resta anche /api/v1/health per chi lo usa già.
// Non espone alcun dato: solo tre campi.

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
    { ok: true, app: "deluxy-tasks", database },
    { headers: { "Cache-Control": "no-store" } },
  );
}

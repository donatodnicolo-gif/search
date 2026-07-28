import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Health-check pubblico, standard per tutte le app Deluxy: dice se il server
// risponde e se il database è raggiungibile davvero (non basta che il processo
// sia vivo: senza database l'app non serve a nulla). Lo legge la pagina
// /stato del Hub. Non espone alcun dato: solo tre booleani.

export const dynamic = "force-dynamic";

export async function GET() {
  let database = false;
  try {
    // Query più banale possibile: tocca la connessione, non i dati.
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }

  return NextResponse.json(
    { ok: true, app: "deluxy-hub", database },
    { headers: { "Cache-Control": "no-store" } },
  );
}

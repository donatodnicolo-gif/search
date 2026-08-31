import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { importaFattureFicSicure } from "@/lib/fic-mancanti";
import { env, pulisci } from "@/lib/env";
import { segretoCombacia } from "@/lib/confronto";

// Ogni notte: le fatture emesse su Fatture in Cloud che Finance non ha entrano
// da sole — se il cliente ha una scheda abbinata e una tipologia già decisa in
// passato. Le altre restano in /fatture/da-fic finché una persona non sceglie
// (una volta sola: da lì il cliente è imparato).
//
// È il controllo chiesto dall'utente il 31/08/2026, dopo aver scoperto che ad
// agosto 36 fatture per 15.216 € netti erano su FIC e non qui — e quindi
// invisibili al fatturato per tipologia e a Deluxy Budgets.
//
// Stessa protezione degli altri cron: Bearer CRON_SECRET, fail-closed.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const segreto = env("CRON_SECRET");
  if (!segreto) {
    return NextResponse.json(
      { errore: "CRON_SECRET non configurato: import FIC disattivato." },
      { status: 503 }
    );
  }
  const inviato = pulisci(req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""));
  if (!segretoCombacia(inviato, segreto)) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  const esito = await importaFattureFicSicure("cron");
  if (esito.ok && esito.importate > 0) revalidatePath("/fatture", "layout");
  return NextResponse.json(esito, { status: esito.ok ? 200 : 502 });
}

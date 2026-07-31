import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { importaAttivi } from "@/lib/importa-registro";
import { env, pulisci } from "@/lib/env";

// Ogni notte: i partner diventati ATTIVI nel registro Anagrafiche entrano in
// FINANCE. Chi c'è già viene saltato, e chi combacia per nome senza avere
// l'`anagraficaId` viene collegato invece che duplicato.
//
// Protezione: header "Authorization: Bearer <CRON_SECRET>" (Vercel lo invia da
// solo se la variabile è impostata). Senza segreto la rotta risponde 503, così
// non resta un endpoint aperto che crea schede.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const segreto = env("CRON_SECRET");
  if (!segreto) {
    return NextResponse.json(
      { errore: "CRON_SECRET non configurato: import automatico disattivato." },
      { status: 503 }
    );
  }
  // confronto sui valori ripuliti: un a-capo nella variabile su Vercel farebbe
  // fallire il match tutte le notti, in silenzio
  const inviato = pulisci(req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""));
  if (inviato !== segreto) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  try {
    const esito = await importaAttivi("cron");
    if (esito.errore) return NextResponse.json({ ok: false, errore: esito.errore }, { status: 200 });
    if (esito.creati.length || esito.collegati.length) {
      revalidatePath("/partner", "layout");
      revalidatePath("/", "layout");
    }
    return NextResponse.json({
      ok: true,
      creati: esito.creati.length,
      collegati: esito.collegati.length,
      nomi: esito.creati,
    });
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 500 });
  }
}

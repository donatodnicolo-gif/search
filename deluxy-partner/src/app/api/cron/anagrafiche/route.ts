import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { importaAttivi } from "@/lib/importa-registro";
import { inviaStatiFinanziari } from "@/lib/stato-finanziario-registro";
import { env, pulisci } from "@/lib/env";
import { segretoCombacia } from "@/lib/confronto";

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
  if (!segretoCombacia(inviato, segreto)) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  try {
    const esito = await importaAttivi("cron");
    if (esito.creati.length || esito.collegati.length) {
      revalidatePath("/partner", "layout");
      revalidatePath("/", "layout");
    }
    // Nello stesso giro si rimanda al registro COME PAGA ciascun cliente: è un
    // dato che nasce qui (fatture e scaduto) e che al registro serve per non
    // mandare un commerciale a firmare con un insoluto. Parte solo per chi è
    // cambiato, e non deve far fallire l'import se il registro non risponde.
    const stati = await inviaStatiFinanziari().catch((e) => ({
      inviati: [],
      invariati: 0,
      errori: [(e as Error).message],
      errore: undefined,
    }));
    return NextResponse.json({
      ok: !esito.errore,
      ...(esito.errore ? { errore: esito.errore } : {}),
      creati: esito.creati.length,
      collegati: esito.collegati.length,
      daDecidere: esito.dubbi,
      nomi: esito.creati,
      statiInviati: stati.inviati.length,
      statiInvariati: stati.invariati,
      ...(stati.errore ? { statiErrore: stati.errore } : {}),
      ...(stati.errori.length ? { statiErrori: stati.errori.slice(0, 5) } : {}),
    });
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 500 });
  }
}

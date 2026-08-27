import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { eseguiSyncOrdini } from "@/lib/ordini-sync";
import { ordersConfigurato } from "@/lib/ordini-registro";
import { env, pulisci } from "@/lib/env";
import { segretoCombacia } from "@/lib/confronto";

// Sincronizzazione automatica notturna degli ordini (cron Vercel, vedi
// vercel.json). Scarica gli ordini recenti dal registro Deluxy Orders e li
// aggiorna: NON registra incassi e la riconciliazione dei bonifici resta una
// conferma dell'operatore in /ordini.
//
// Protezione: header "Authorization: Bearer <CRON_SECRET>" (Vercel lo invia da
// solo se la variabile CRON_SECRET è impostata). Senza segreto configurato la
// rotta risponde 503, così non resta un endpoint aperto.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const segreto = env("CRON_SECRET");
  if (!segreto) {
    return NextResponse.json(
      { errore: "CRON_SECRET non configurato: sincronizzazione automatica disattivata." },
      { status: 503 }
    );
  }
  // Confronto sui due valori ripuliti: un BOM o un a-capo nella variabile su
  // Vercel farebbe fallire il match e il cron risponderebbe 401 tutte le notti
  // senza che nessuno se ne accorga.
  const inviato = pulisci(req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""));
  if (!segretoCombacia(inviato, segreto)) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  // La sorgente sono gli ordini del registro Deluxy Orders, non più i token
  // Shopify dei negozi: prima si controllava che esistesse un negozio con
  // token e il cron si sarebbe fermato da solo appena i token fossero scaduti,
  // pur avendo tutto il necessario per scaricare gli ordini.
  if (!ordersConfigurato()) {
    return NextResponse.json({ saltato: "ORDERS_API_KEY non configurata: registro Deluxy Orders non raggiungibile." }, { status: 200 });
  }

  try {
    const esito = await eseguiSyncOrdini(90);
    revalidatePath("/ordini", "layout");
    return NextResponse.json({
      ok: true,
      nuovi: esito.nuovi,
      aggiornati: esito.aggiornati,
      errori: esito.errori,
      nota: "Ordini aggiornati; la riconciliazione dei bonifici resta da confermare in /ordini.",
    });
  } catch (e) {
    return NextResponse.json({ errore: (e as Error).message }, { status: 500 });
  }
}

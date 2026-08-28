import { NextRequest, NextResponse } from "next/server";
import { confrontaSicuro } from "@/lib/crypto";
import { processaNotificheInSospeso } from "@/lib/webhook";

// Lo «sweeper» dell'outbox: riprova le notifiche che aspettano un tentativo
// (il primo parte subito col cambio di stato; qui passano il 2° e il 3°, ogni
// volta RIFIRMATI con timestamp fresco). Dopo 3 tentativi la riga resta
// «fallita»: si rilancia a mano dal dettaglio della richiesta, e il paracadute
// vero del chiamante è il pull ?aggiornateDa=.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const atteso = (process.env.CRON_SECRET ?? "").trim();
  const arrivato = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!atteso || !confrontaSicuro(atteso, arrivato)) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  const esito = await processaNotificheInSospeso(20);
  return NextResponse.json({ ok: true, ...esito }, { headers: { "Cache-Control": "no-store" } });
}

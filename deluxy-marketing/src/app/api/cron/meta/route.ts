import { NextRequest, NextResponse } from "next/server";
import { eseguiSyncMeta } from "@/lib/sync-meta";

// GET /api/cron/meta — la sync Meta che parte da sola, ogni ora.
//
// Perché esiste. Google spinge i dati dentro con gli Scripts, e infatti è
// sempre aggiornato a oggi. Meta gli Scripts non li ha: è l'app che deve
// andare a prendere i dati, e finché l'unica porta era `POST /api/v1/sync/meta`
// (chiave di scrittura, quindi una persona o uno script) i numeri Meta si
// aggiornavano solo se qualcuno premeva un bottone. Il 28/07/2026 Google era a
// oggi e Meta fermo a ieri, per questo.
//
// Chi può chiamarla. Il cron di Vercel manda `Authorization: Bearer $CRON_SECRET`
// (la variabile va impostata sul progetto). **Senza CRON_SECRET l'endpoint è
// chiuso**: aperto sarebbe un modo per far chiamare la Graph API a chiunque,
// e in produzione un endpoint aperto per sbaglio non si nota finché non è
// tardi. In sviluppo si passa lo stesso header a mano.
//
// Finestra: 7 giorni indietro, non 1. Meta consolida le conversioni nei giorni
// successivi, quindi il numero di ieri cambia ancora: ripassare la settimana
// costa poco e corregge quello che era arrivato parziale.

export const dynamic = "force-dynamic";
// Il giro su 3 account con la Graph API non sta nei 10 secondi di default.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const segreto = (process.env.CRON_SECRET || "").trim();
  if (!segreto) {
    return NextResponse.json(
      {
        errore:
          "CRON_SECRET non impostato: l'endpoint del cron resta chiuso. Impostalo fra le variabili d'ambiente del progetto (Vercel lo manda da solo come Authorization: Bearer).",
      },
      { status: 503 }
    );
  }
  const atteso = `Bearer ${segreto}`;
  if (req.headers.get("authorization") !== atteso) {
    return NextResponse.json({ errore: "Non autorizzato" }, { status: 401 });
  }

  const esito = await eseguiSyncMeta({ giorni: 7 }, "cron");
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: esito.codice });

  return NextResponse.json(
    {
      periodo: esito.periodo,
      totaleMetriche: esito.totaleMetriche,
      account: esito.account,
      nota: esito.nota,
    },
    { status: esito.tuttiInErrore ? 502 : 200 }
  );
}

import { NextRequest, NextResponse } from "next/server";
import { eseguiSyncTikTok } from "@/lib/sync-tiktok";

// GET /api/cron/tiktok — la sync TikTok che parte da sola, come quella di Meta.
//
// Perché esiste. Google spinge i dati dentro con gli Scripts; TikTok e Meta no,
// è l'app che deve andare a prenderli. Meta ha avuto il suo cron il 28/07/2026,
// dopo un giorno in cui Google era aggiornato a oggi e Meta fermo a ieri.
// TikTok era rimasto a metà: token, pagina delle impostazioni, registro degli
// advertiser, sincronizzazione — tutto pronto, e **nessuno che la facesse
// partire**. Collegare TikTok avrebbe prodotto zero righe finché qualcuno non
// chiamava a mano l'endpoint con una chiave di scrittura, cioè mai.
//
// Chi può chiamarla. Il cron di Vercel manda `Authorization: Bearer $CRON_SECRET`.
// **Senza CRON_SECRET l'endpoint resta CHIUSO**: aperto sarebbe un modo per far
// chiamare la Business API di TikTok a chiunque.
//
// Orario. Ogni due ore al minuto 37, sfalsato da Meta (:07) e dagli ordini
// (:20): tre giri che partono insieme si contendono lo stesso pool di
// connessioni del Postgres condiviso, e `connection_limit 5` non perdona.

export const dynamic = "force-dynamic";
// Il giro sugli advertiser con la Business API non sta nei 10 secondi di
// default: TikTok pagina a 1.000 righe e il report si fa attendere.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const segreto = (process.env.CRON_SECRET || "").trim();
  if (!segreto) {
    return NextResponse.json(
      {
        errore:
          "CRON_SECRET non impostato: l'endpoint del cron resta chiuso. Impostalo fra le variabili d'ambiente del progetto (Vercel lo manda da solo come Authorization: Bearer).",
      },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: "Non autorizzato" }, { status: 401 });
  }

  const esito = await eseguiSyncTikTok({ giorni: 7 }, "cron");
  if (!esito.ok) {
    // ⚠️ 503 e 400 NON sono guasti del cron: sono «TikTok non è collegato» e
    // «nessun advertiser censito». Si rispondono con il loro codice e la loro
    // frase, così nel registro dei cron si legge cosa manca invece di un
    // fallimento generico che sembra un'app rotta.
    return NextResponse.json({ errore: esito.errore }, { status: esito.codice });
  }

  return NextResponse.json(
    {
      periodo: esito.periodo,
      totaleMetriche: esito.totaleMetriche,
      account: esito.account,
      note: esito.note,
    },
    { status: esito.tuttiInErrore ? 502 : 200 },
  );
}

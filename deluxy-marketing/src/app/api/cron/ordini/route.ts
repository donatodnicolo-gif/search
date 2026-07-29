import { NextRequest, NextResponse } from "next/server";
import { eseguiSyncOrdini } from "@/lib/sync-ordini";

// GET /api/cron/ordini — gli ordini che si aggiornano da soli, ogni notte.
//
// Perché esiste. Gli ordini sono la metà "vendite" di ogni KPI: ROS reale,
// MER, costo di acquisizione. Ma l'unico modo di aggiornarli era
// `npm run import:ordini-orders` dal PC di qualcuno, e il 29/07/2026 la spesa
// era aggiornata a oggi e gli ordini fermi al 27. Due giorni di sfasamento non
// si vedono: si vedono solo dei rapporti PEGGIORI DEL VERO, perché la spesa
// corre e le vendite no. È lo stesso difetto che aveva Meta finché l'unica
// porta era un bottone, e si cura allo stesso modo.
//
// Chi può chiamarla. Il cron di Vercel manda `Authorization: Bearer $CRON_SECRET`.
// **Senza CRON_SECRET l'endpoint è chiuso**: un endpoint aperto per sbaglio non
// si nota finché non è tardi.
//
// Finestra: 7 giorni indietro, non 1. Un ordine cambia stato dopo essere stato
// creato — rimborso, annullamento — e ripassare la settimana costa poco.
//
// Per i caricamenti storici lunghi resta lo script `import:ordini-orders`: una
// funzione serverless non ha il tempo di attraversare 8.000 ordini, e infatti
// questa si ferma da sola quando il tempo sta per finire, dicendo dov'è
// arrivata invece di essere uccisa a metà pagina.

export const dynamic = "force-dynamic";
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
  if (req.headers.get("authorization") !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: "Non autorizzato" }, { status: 401 });
  }

  // 45 s di lavoro dentro i 60 di maxDuration: il margine serve a chiudere le
  // scritture in corso e a rispondere, invece di essere troncati.
  const esito = await eseguiSyncOrdini({ budgetMs: 45_000 }, "cron");
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: esito.codice });

  return NextResponse.json({
    periodo: esito.periodo,
    nuovi: esito.nuovi,
    aggiornati: esito.aggiornati,
    invariati: esito.invariati,
    righe: esito.righe,
    perBrand: esito.perBrand,
    completo: esito.completo,
    nota: esito.nota,
  });
}

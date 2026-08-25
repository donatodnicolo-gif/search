import { NextRequest, NextResponse } from "next/server";
import { depositaAppendAzioni } from "@/lib/ponte-drive";

// GET /api/cron/ponte — l'APPEND del log azioni, depositato da solo.
//
// Il modello del ponte (§2) lo marca **OBBLIGATORIO lo stesso giorno**: un log
// che arriva quando capita non serve al custode, che consolida nello sweep di
// inizio sessione. Perciò gira ogni sera, e non aspetta che qualcuno prema.
//
// Orario: 22:40 italiane. ⚠️ Il runtime di Vercel è UTC, quindi il cron si
// scrive in UTC: d'estate le 22:40 di Roma sono le 20:40 UTC. Si accetta lo
// scarto d'inverno (diventano le 21:40 di Roma) invece di inseguire l'ora
// legale con due cron: il file porta comunque data e ora vere in ora di Roma.
// È dopo il giro serale di Google e prima della mezzanotte, così la giornata
// finisce nel file della giornata.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const segreto = (process.env.CRON_SECRET || "").trim();
  if (!segreto) {
    return NextResponse.json(
      { errore: "CRON_SECRET non impostato: l'endpoint del cron resta chiuso." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: "Non autorizzato" }, { status: 401 });
  }

  const esito = await depositaAppendAzioni();
  // ⚠️ «Non c'era niente da scrivere» è un 200, non un errore: una giornata
  // senza operazioni è normale, e segnarla come guasto insegnerebbe a
  // ignorare il registro dei cron.
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 });
  return NextResponse.json(esito, { status: 200 });
}

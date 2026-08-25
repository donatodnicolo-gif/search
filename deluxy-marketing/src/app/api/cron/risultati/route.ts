import { NextRequest, NextResponse } from "next/server";
import { depositaRisultati } from "@/lib/ponte-risultati";

// GET /api/cron/risultati — lo snapshot KPI nel ponte, un file per brand.
//
// Il modello (§3) lo vuole **settimanale**: gira il lunedì mattina, così i
// progetti di brand aprono la settimana con i numeri della precedente già
// depositati, invece di doverli chiedere.
//
// ⚠️ Separato dal cron del log azioni (`/api/cron/ponte`, ogni sera) perché
// rispondono a due domande diverse e hanno due ritmi diversi: quello dice
// *cosa è stato fatto*, questo *come sta andando*. Metterli insieme avrebbe
// legato la frequenza del secondo a quella del primo.
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

  const esito = await depositaRisultati();
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 });
  return NextResponse.json({ file: esito.file }, { status: 200 });
}

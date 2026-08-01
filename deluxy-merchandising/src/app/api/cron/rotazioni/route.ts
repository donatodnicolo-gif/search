import { NextRequest, NextResponse } from "next/server";
import { eseguiRotazioniDovute } from "@/lib/rotazione";

// Le **rotazioni periodiche** delle collezioni (vedi vercel.json).
//
// Gira **una volta al giorno** e fa scattare solo le regole scadute: così
// giornaliera, settimanale e mensile convivono con un cron solo. Se un giorno il
// giro salta, quello dopo recupera — la scadenza si misura sui giorni passati
// dall'ultima esecuzione, non su un calendario fisso.
//
// Protezione: header "Authorization: Bearer <CRON_SECRET>", che Vercel invia da
// solo quando la variabile è impostata sul progetto. Senza segreto la rotta
// risponde 503 invece di restare un endpoint aperto a chiunque — qui dietro c'è
// anche la scrittura sul negozio vero, per le regole che l'hanno accesa.
export const dynamic = "force-dynamic";
// Una regola può toccare molte collezioni, e ognuna può scrivere su Shopify.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET;
  if (!segreto) {
    return NextResponse.json(
      { errore: "CRON_SECRET non configurato: rotazione automatica disattivata." },
      { status: 503 }
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  try {
    const esito = await eseguiRotazioniDovute();
    return NextResponse.json({ ok: true, ...esito });
  } catch (e) {
    return NextResponse.json({ errore: e instanceof Error ? e.message : "Errore" }, { status: 500 });
  }
}

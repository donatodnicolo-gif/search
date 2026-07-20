import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { qontoConfigurato } from "@/lib/qonto";
import { scaricaMovimentiQonto } from "@/lib/transazioni-actions";

// Sincronizzazione automatica dei movimenti Qonto (cron Vercel, vedi vercel.json).
// Scarica i movimenti completati e li deduplica per hash: NON registra nulla e
// non tocca fatture o saldi. I movimenti restano "nuovi" in /transazioni, dove
// l'operatore conferma i match proposti: la registrazione resta una scelta umana.
//
// Protezione: header "Authorization: Bearer <CRON_SECRET>" (Vercel lo invia da
// solo se la variabile CRON_SECRET è impostata sul progetto). Senza segreto
// configurato la rotta risponde 503, così non resta un endpoint aperto.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET;
  if (!segreto) {
    return NextResponse.json(
      { errore: "CRON_SECRET non configurato: sincronizzazione automatica disattivata." },
      { status: 503 }
    );
  }
  const autorizzato = req.headers.get("authorization") === `Bearer ${segreto}`;
  if (!autorizzato) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  if (!(await qontoConfigurato())) {
    return NextResponse.json({ saltato: "Qonto non configurato." }, { status: 200 });
  }

  try {
    const esito = await scaricaMovimentiQonto();
    revalidatePath("/transazioni", "layout");
    revalidatePath("/", "layout");
    return NextResponse.json({
      ok: true,
      conti: esito.conti,
      movimentiLetti: esito.totali,
      nuovi: esito.nuove,
      giaPresenti: esito.totali - esito.nuove,
      nota: "Movimenti solo scaricati: le registrazioni restano da confermare in /transazioni.",
    });
  } catch (e) {
    // 500 così il tentativo risulta fallito nei log di Vercel
    return NextResponse.json({ errore: (e as Error).message }, { status: 500 });
  }
}

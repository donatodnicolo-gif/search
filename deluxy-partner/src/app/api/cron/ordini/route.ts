import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { eseguiSyncOrdini } from "@/lib/ordini-sync";

// Sincronizzazione automatica notturna degli ordini Shopify (cron Vercel, vedi
// vercel.json). Scarica gli ordini recenti da tutti i negozi collegati e li
// aggiorna: NON registra incassi e la riconciliazione dei bonifici resta una
// conferma dell'operatore in /ordini.
//
// Protezione: header "Authorization: Bearer <CRON_SECRET>" (Vercel lo invia da
// solo se la variabile CRON_SECRET è impostata). Senza segreto configurato la
// rotta risponde 503, così non resta un endpoint aperto.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET;
  if (!segreto) {
    return NextResponse.json(
      { errore: "CRON_SECRET non configurato: sincronizzazione automatica disattivata." },
      { status: 503 }
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  const negozi = await prisma.negozioShopify.count({ where: { attivo: true, token: { not: "" } } });
  if (negozi === 0) {
    return NextResponse.json({ saltato: "Nessun negozio Shopify collegato con token." }, { status: 200 });
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

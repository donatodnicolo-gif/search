import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Health-check pubblico, standard per tutte le app Deluxy: dice se il server
// risponde e se il database è raggiungibile davvero. Lo legge la pagina /stato
// del Hub. Non espone alcun dato: solo tre booleani.
//
// ⚠️ Con `?meta=1` aggiunge la diagnosi del canale di scrittura Meta: se l'app
// può scrivere e, quando non può, perché. Serve da FUORI: la stessa risposta si
// legge dentro l'app, ma quella pagina vuole la password, e per capire perché un
// bottone non compare bisogna poterlo chiedere senza essere quella persona
// davanti a quello schermo.
//
// Non espone segreti: nessun token, nessun id, nessun numero di spesa — solo
// «si può / non si può» e la frase che spiega cosa manca. I contatori delle
// operazioni sono due interi. Chi chiama senza il parametro riceve esattamente
// la risposta di prima, che è quella su cui si basa il Hub.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }

  const base = { ok: true, app: "deluxy-marketing", database };

  if (req.nextUrl.searchParams.get("meta") !== "1") {
    return NextResponse.json(base, { headers: { "Cache-Control": "no-store" } });
  }

  let meta: Record<string, unknown>;
  try {
    const { metaPuoScrivere } = await import("@/lib/meta-scrittura");
    const [permesso, inAttesa, approvate] = await Promise.all([
      metaPuoScrivere(),
      prisma.operazioneAdv.count({ where: { canale: "meta_ads", stato: "in_attesa" } }),
      prisma.operazioneAdv.count({ where: { canale: "meta_ads", stato: "approvata" } }),
    ]);
    meta = {
      puoScrivere: permesso.puo,
      perche: permesso.perche,
      inAttesa,
      approvate,
      // Quello che la pagina /operazioni decide con questi stessi numeri: se il
      // riquadro compare e se il bottone c'è. È la differenza fra «non lo vedo»
      // e «non c'è».
      riquadroVisibile: !(inAttesa === 0 && approvate === 0 && !permesso.puo),
      bottoneVisibile: permesso.puo,
    };
  } catch (e) {
    meta = { errore: String(e) };
  }

  return NextResponse.json({ ...base, meta }, { headers: { "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { proponiRettificheAdv, riconciliaAdv } from "@/lib/adv-competenza";

// Porta in competenza di un altro anno la pubblicità pagata dal conto che non
// corrisponde alle campagne dell'anno. È un gesto solo, ma scrive nei conti di
// due esercizi: si fa da un bottone, con i numeri davanti (vedi
// `src/lib/adv-competenza.ts` per il perché non è automatico).

const anno = (v: unknown) => {
  const n = Math.trunc(Number(v));
  return n >= 2000 && n <= 2100 ? n : null;
};

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const annoOrigine = anno(b?.anno);
  const annoCompetenza = anno(b?.annoCompetenza);
  const meseCompetenza = Math.trunc(Number(b?.meseCompetenza ?? 12));

  if (!annoOrigine || !annoCompetenza) {
    return NextResponse.json({ error: "anno non valido" }, { status: 400 });
  }
  if (annoCompetenza === annoOrigine) {
    return NextResponse.json(
      { error: "l'anno di competenza deve essere diverso da quello in cui il conto ha pagato" },
      { status: 400 }
    );
  }
  if (!(meseCompetenza >= 1 && meseCompetenza <= 12)) {
    return NextResponse.json({ error: "mese di competenza non valido" }, { status: 400 });
  }

  const ric = await riconciliaAdv(annoOrigine);
  if (!ric.ok) return NextResponse.json({ error: ric.errore ?? "riconciliazione non riuscita" }, { status: 502 });
  if (ric.totDifferenza <= 0) {
    return NextResponse.json({ error: "non c'è nessuna differenza da spostare" }, { status: 400 });
  }

  const righe = proponiRettificheAdv(ric, annoCompetenza, meseCompetenza);
  if (righe.length === 0) {
    return NextResponse.json({ error: "la differenza non è attribuibile a nessuna controparte" }, { status: 400 });
  }

  await prisma.rettificaCompetenza.createMany({ data: righe });
  const spostato = righe.reduce((s, r) => s + r.importo, 0);
  return NextResponse.json({ ok: true, create: righe.length, spostato });
}

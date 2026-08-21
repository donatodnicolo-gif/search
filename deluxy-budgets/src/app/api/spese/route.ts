import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { meseChiuso } from "@/lib/periodo";

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const year = Number(body?.year);
  const entries = Array.isArray(body?.entries) ? body.entries : null;
  if (!year || !entries) {
    return NextResponse.json({ error: "payload non valido" }, { status: 400 });
  }

  // I mesi passati si rifiutano **qui**, non solo nel form. Un input
  // `disabled` è una cortesia verso chi guarda la pagina, non un blocco: la
  // stessa PUT partita da un'altra scheda rimasta aperta da ieri, o rigiocata
  // a mano, riscriverebbe il budget di un mese già speso.
  const rifiutati: number[] = [];

  for (const e of entries) {
    const maisonId = String(e?.maisonId ?? "");
    const month = Number(e?.month);
    const percent = Math.min(100, Math.max(0, Number(e?.percent) || 0));
    if (!maisonId || month < 1 || month > 12) continue;
    if (meseChiuso(year, month)) {
      if (!rifiutati.includes(month)) rifiutati.push(month);
      continue;
    }
    await prisma.advPercent.upsert({
      where: { year_maisonId_month: { year, maisonId, month } },
      update: { percent },
      create: { year, maisonId, month, percent },
    });
  }

  // Si dichiara quello che non è stato scritto: un `ok` secco su una richiesta
  // scartata a metà è il modo più veloce per credere di aver salvato.
  return NextResponse.json({ ok: true, mesiChiusiIgnorati: rifiutati.sort((a, b) => a - b) });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Le rettifiche di competenza: l'unico posto in cui si decide a quale esercizio
// appartiene un'entrata o un'uscita. Finance passa i valori con la data del
// movimento e non sa niente di questo.

const TIPI = ["USCITA", "RICAVO"];
const mese = (v: unknown) => {
  const n = Math.trunc(Number(v));
  return n >= 1 && n <= 12 ? n : null;
};
const anno = (v: unknown) => {
  const n = Math.trunc(Number(v));
  return n >= 2000 && n <= 2100 ? n : null;
};

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const tipo = String(b?.tipo ?? "");
  const voce = String(b?.voce ?? "").trim();
  const annoOrigine = anno(b?.annoOrigine);
  const meseOrigine = mese(b?.meseOrigine);
  const annoCompetenza = anno(b?.annoCompetenza);
  const meseCompetenza = mese(b?.meseCompetenza ?? b?.meseOrigine);
  const importo = Number(b?.importo);

  if (!TIPI.includes(tipo)) return NextResponse.json({ error: "tipo non valido" }, { status: 400 });
  if (!voce) return NextResponse.json({ error: "voce mancante" }, { status: 400 });
  if (!annoOrigine || !meseOrigine || !annoCompetenza || !meseCompetenza) {
    return NextResponse.json({ error: "anno o mese non validi" }, { status: 400 });
  }
  if (!Number.isFinite(importo) || importo <= 0) {
    return NextResponse.json({ error: "importo non valido" }, { status: 400 });
  }
  if (annoOrigine === annoCompetenza && meseOrigine === meseCompetenza) {
    return NextResponse.json({ error: "origine e competenza coincidono: non c'è niente da spostare" }, { status: 400 });
  }

  const creata = await prisma.rettificaCompetenza.create({
    data: {
      tipo, voce, annoOrigine, meseOrigine, annoCompetenza, meseCompetenza, importo,
      nota: typeof b?.nota === "string" && b.nota.trim() ? b.nota.trim() : null,
    },
  });
  return NextResponse.json({ ok: true, id: creata.id });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
  await prisma.rettificaCompetenza.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

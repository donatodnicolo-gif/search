import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.autore !== "string" || !body.autore.trim()) {
    return NextResponse.json({ error: "autore mancante" }, { status: 400 });
  }
  // **Una proposta contiene solo i mesi che propone.** Pretendere dodici mesi
  // sembrava un controllo di completezza, e invece obbligava a riempire di zeri
  // i mesi già chiusi: siccome il consolidamento scrive nel budget *quello che
  // la proposta contiene*, quegli zeri cancellavano il budget pubblicato dei
  // mesi passati. Si accettano da 1 a 12 mesi, ognuno valido e senza doppioni.
  const valori = (Array.isArray(body.valori) ? body.valori : []) as { month?: unknown; valore?: unknown }[];
  const mesi = new Set<number>();
  for (const v of valori) {
    const m = Number(v?.month);
    if (!Number.isInteger(m) || m < 1 || m > 12 || mesi.has(m)) {
      return NextResponse.json({ error: "mesi non validi o ripetuti" }, { status: 400 });
    }
    mesi.add(m);
  }
  if (mesi.size === 0) {
    return NextResponse.json({ error: "serve almeno un mese da proporre" }, { status: 400 });
  }
  const ambitoTipo = ["MAISON", "LINEA", "GLOBALE"].includes(body.ambitoTipo)
    ? body.ambitoTipo
    : "GLOBALE";

  const proposta = await prisma.propostaBudget.create({
    data: {
      year: Number(body.year) || new Date().getFullYear(),
      autore: body.autore.trim(),
      ruolo: typeof body.ruolo === "string" ? body.ruolo : "Responsabile",
      ambitoTipo,
      ambitoSlug: ambitoTipo === "GLOBALE" ? null : (body.ambitoSlug ?? null),
      note: typeof body.note === "string" ? body.note : null,
      valori: JSON.stringify(
        valori.map((v) => ({ month: Number(v.month), valore: Number(v.valore) || 0 }))
      ),
    },
  });
  return NextResponse.json({ ok: true, id: proposta.id });
}

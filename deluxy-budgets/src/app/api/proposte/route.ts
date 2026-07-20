import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.autore !== "string" || !body.autore.trim()) {
    return NextResponse.json({ error: "autore mancante" }, { status: 400 });
  }
  const valori = Array.isArray(body.valori) ? body.valori : [];
  if (valori.length !== 12) {
    return NextResponse.json({ error: "servono 12 mesi" }, { status: 400 });
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
        valori.map((v: { month: number; valore: number }, i: number) => ({
          month: Number(v?.month) || i + 1,
          valore: Number(v?.valore) || 0,
        }))
      ),
    },
  });
  return NextResponse.json({ ok: true, id: proposta.id });
}

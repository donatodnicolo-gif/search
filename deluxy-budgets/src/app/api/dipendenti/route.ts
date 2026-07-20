import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const TIPI = ["DIPENDENTE", "STAGISTA", "CONSULENTE"];
const PERIODICITA = ["ANNUO", "MENSILE"];

// Ripulisce il payload del form: i valori fuori scala qui diventerebbero
// costi sbagliati nel P&L, quindi si normalizzano una volta sola.
function normalizza(body: Record<string, unknown>) {
  const mesi = Array.isArray(body.mesi)
    ? [...new Set((body.mesi as unknown[]).map(Number))].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b)
    : [];
  return {
    nome: String(body.nome ?? "").trim(),
    ruolo: body.ruolo ? String(body.ruolo).trim() : null,
    tipo: TIPI.includes(String(body.tipo)) ? String(body.tipo) : "DIPENDENTE",
    importo: Math.max(0, Number(body.importo) || 0),
    periodicita: PERIODICITA.includes(String(body.periodicita)) ? String(body.periodicita) : "ANNUO",
    contributiPct: Math.min(200, Math.max(0, Number(body.contributiPct) || 0)),
    mesi: JSON.stringify(mesi),
    maisonId: body.maisonId ? String(body.maisonId) : null,
    note: body.note ? String(body.note).trim() : null,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "payload non valido" }, { status: 400 });
  const dati = normalizza(body);
  if (!dati.nome) return NextResponse.json({ error: "nome mancante" }, { status: 400 });

  const creato = await prisma.dipendente.create({
    data: { year: Number(body.year) || new Date().getFullYear(), ...dati },
  });
  return NextResponse.json({ ok: true, id: creato.id });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id mancante" }, { status: 400 });
  }
  const dati = normalizza(body);
  if (!dati.nome) return NextResponse.json({ error: "nome mancante" }, { status: 400 });

  await prisma.dipendente.update({ where: { id: body.id }, data: dati });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
  await prisma.dipendente.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

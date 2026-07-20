import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const COLORI = ["green", "gold", "blue", "purple", "orange", "neutral"];

function normalizza(body: Record<string, unknown>) {
  return {
    nome: String(body.nome ?? "").trim(),
    responsabile: body.responsabile ? String(body.responsabile).trim() : null,
    colore: COLORI.includes(String(body.colore)) ? String(body.colore) : "neutral",
    ordine: Number(body.ordine) || 0,
    note: body.note ? String(body.note).trim() : null,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "payload non valido" }, { status: 400 });
  const dati = normalizza(body);
  if (!dati.nome) return NextResponse.json({ error: "nome mancante" }, { status: 400 });

  // Il nome è unico: un doppione va segnalato, non creato in silenzio.
  const esiste = await prisma.team.findUnique({ where: { nome: dati.nome } });
  if (esiste) return NextResponse.json({ error: "esiste già un team con questo nome" }, { status: 409 });

  const creato = await prisma.team.create({ data: dati });
  return NextResponse.json({ ok: true, id: creato.id });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id mancante" }, { status: 400 });
  }
  const dati = normalizza(body);
  if (!dati.nome) return NextResponse.json({ error: "nome mancante" }, { status: 400 });

  const omonimo = await prisma.team.findUnique({ where: { nome: dati.nome } });
  if (omonimo && omonimo.id !== body.id) {
    return NextResponse.json({ error: "esiste già un team con questo nome" }, { status: 409 });
  }

  await prisma.team.update({ where: { id: body.id }, data: dati });
  return NextResponse.json({ ok: true });
}

// Sciogliere un team non tocca le persone: restano a budget senza team
// (onDelete: SetNull nello schema).
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
  await prisma.team.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

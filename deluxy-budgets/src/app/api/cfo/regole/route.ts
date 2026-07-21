import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Assegna una controparte a una categoria creando una regola. Dal CFO si usa
// per categorizzare al volo una controparte non ancora classificata.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const match = String(body?.match ?? "").trim();
  const categoriaId = String(body?.categoriaId ?? "");
  if (!match || !categoriaId) {
    return NextResponse.json({ error: "match e categoria richiesti" }, { status: 400 });
  }
  const cat = await prisma.categoriaCosto.findUnique({ where: { id: categoriaId } });
  if (!cat) return NextResponse.json({ error: "categoria inesistente" }, { status: 404 });

  const regola = await prisma.regolaCosto.create({
    data: { match, esatto: Boolean(body?.esatto), categoriaId },
  });
  return NextResponse.json({ ok: true, id: regola.id });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
  await prisma.regolaCosto.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

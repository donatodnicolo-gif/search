import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const TIPI = ["COGS", "ADV", "PERSONALE", "STRUTTURA", "ESCLUSA"];

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const nome = String(body?.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "nome mancante" }, { status: 400 });

  const esiste = await prisma.categoriaCosto.findUnique({ where: { nome } });
  if (esiste) return NextResponse.json({ error: "categoria già esistente" }, { status: 409 });

  const quante = await prisma.categoriaCosto.count();
  const creata = await prisma.categoriaCosto.create({
    data: {
      nome,
      tipoPL: TIPI.includes(String(body?.tipoPL)) ? String(body.tipoPL) : "STRUTTURA",
      colore: body?.colore ? String(body.colore) : null,
      ordine: quante,
    },
  });
  return NextResponse.json({ ok: true, id: creata.id });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return NextResponse.json({ error: "id mancante" }, { status: 400 });
  }
  const nome = typeof body.nome === "string" && body.nome.trim() ? body.nome.trim() : undefined;
  if (nome) {
    const omonima = await prisma.categoriaCosto.findUnique({ where: { nome } });
    if (omonima && omonima.id !== body.id) {
      return NextResponse.json({ error: "categoria già esistente" }, { status: 409 });
    }
  }
  await prisma.categoriaCosto.update({
    where: { id: body.id },
    data: {
      nome,
      tipoPL: TIPI.includes(String(body?.tipoPL)) ? String(body.tipoPL) : undefined,
      colore: typeof body?.colore === "string" ? body.colore : undefined,
    },
  });
  return NextResponse.json({ ok: true });
}

// Eliminando la categoria spariscono anche le sue regole (onDelete Cascade):
// le controparti collegate tornano "non categorizzate", nessun dato perso.
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
  await prisma.categoriaCosto.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

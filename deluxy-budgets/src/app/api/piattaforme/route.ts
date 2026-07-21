import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const COLORI = ["blue", "purple", "green", "gold", "orange", "neutral"];

function percent(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

// Salva in blocco le % di split (piattaforma × mese) di un anno.
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const year = Number(body?.year);
  const voci = Array.isArray(body?.split) ? body.split : null;
  if (!year || !voci) return NextResponse.json({ error: "payload non valido" }, { status: 400 });

  for (const v of voci) {
    const piattaformaId = String(v?.piattaformaId ?? "");
    const month = Number(v?.month);
    if (!piattaformaId || month < 1 || month > 12) continue;
    await prisma.piattaformaSplit.upsert({
      where: { year_piattaformaId_month: { year, piattaformaId, month } },
      update: { percent: percent(v.percent) },
      create: { year, piattaformaId, month, percent: percent(v.percent) },
    });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const nome = String(body?.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "nome mancante" }, { status: 400 });

  const esiste = await prisma.piattaformaAdv.findUnique({ where: { nome } });
  if (esiste) return NextResponse.json({ error: "esiste già una piattaforma con questo nome" }, { status: 409 });

  const quante = await prisma.piattaformaAdv.count();
  const creata = await prisma.piattaformaAdv.create({
    data: {
      nome,
      colore: COLORI.includes(String(body?.colore)) ? String(body.colore) : "neutral",
      ordine: quante,
    },
  });
  return NextResponse.json({ ok: true, id: creata.id });
}

// Rimuovere una piattaforma cancella anche le sue % (cascade nello schema).
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });
  await prisma.piattaformaAdv.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

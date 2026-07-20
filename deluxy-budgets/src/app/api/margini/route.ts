import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Lo slug entra nei BudgetEntry: niente spazi né accenti, così resta stabile
// anche se il nome visualizzato cambia.
function slugDa(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

function margine(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  // Sopra il 100% il costo del venduto diventerebbe negativo: non ha senso.
  return Math.min(100, Math.max(0, n));
}

// Aggiorna le percentuali di margine in blocco (una PUT sola dal form).
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const voci = Array.isArray(body?.tipologie) ? body.tipologie : null;
  if (!voci) return NextResponse.json({ error: "payload non valido" }, { status: 400 });

  for (const v of voci) {
    if (typeof v?.id !== "string") continue;
    await prisma.tipologiaServizio
      .update({
        where: { id: v.id },
        data: {
          marginePct: margine(v.marginePct),
          nome: typeof v.nome === "string" && v.nome.trim() ? v.nome.trim() : undefined,
          note: typeof v.note === "string" ? v.note.trim() || null : undefined,
        },
      })
      .catch(() => null);
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const nome = String(body?.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "nome mancante" }, { status: 400 });

  const slug = slugDa(nome);
  if (!slug) return NextResponse.json({ error: "nome non valido" }, { status: 400 });

  const esiste = await prisma.tipologiaServizio.findUnique({ where: { slug } });
  if (esiste) {
    return NextResponse.json({ error: "esiste già una tipologia con questo nome" }, { status: 409 });
  }

  const quante = await prisma.tipologiaServizio.count();
  const creata = await prisma.tipologiaServizio.create({
    data: {
      slug,
      nome,
      marginePct: margine(body?.marginePct),
      ordine: quante,
      note: body?.note ? String(body.note).trim() : null,
    },
  });
  return NextResponse.json({ ok: true, id: creata.id, slug: creata.slug });
}

// Una tipologia con ricavi a budget non si elimina: cancellarla renderebbe
// invisibili quei ricavi nel P&L senza che nessuno se ne accorga.
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });

  const tipologia = await prisma.tipologiaServizio.findUnique({ where: { id } });
  if (!tipologia) return NextResponse.json({ ok: true });

  const conRicavi = await prisma.budgetEntry.aggregate({
    where: { canale: tipologia.slug },
    _sum: { vendite: true },
  });
  if ((conRicavi._sum.vendite ?? 0) > 0) {
    return NextResponse.json(
      { error: "la tipologia ha ricavi a budget: azzerali prima di eliminarla" },
      { status: 409 }
    );
  }

  await prisma.budgetEntry.deleteMany({ where: { canale: tipologia.slug } });
  await prisma.tipologiaServizio.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

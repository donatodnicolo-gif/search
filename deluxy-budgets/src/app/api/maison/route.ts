import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Creazione di un brand (maison). Prima di questo i brand esistevano solo nel
// seed: aggiungerne uno voleva dire aprire il database, quindi non lo faceva
// nessuno. Si crea da `/spese`, dove ci si accorge che manca.

// Lo slug finisce in un URL (`/maison/[slug]`) e nell'ambito delle proposte:
// va ricavato dal nome, non chiesto, e deve restare unico.
function slugify(nome: string): string {
  return nome
    .normalize("NFD") // «Bougainvillée» → «Bougainville´e», poi i segni via
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const nome = String(body?.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Serve il nome del brand." }, { status: 400 });
  if (nome.length > 60) return NextResponse.json({ error: "Nome troppo lungo." }, { status: 400 });

  const base = slugify(nome);
  if (!base) {
    return NextResponse.json(
      { error: "Il nome deve contenere almeno una lettera o un numero." },
      { status: 400 }
    );
  }

  // Due brand con lo stesso nome sono quasi sempre un doppio invio o un
  // duplicato involontario: si rifiuta dicendolo, invece di creare un gemello
  // che poi sdoppia i numeri in ogni pagina.
  const gemello = await prisma.maison.findFirst({
    where: { nome: { equals: nome, mode: "insensitive" } },
  });
  if (gemello) {
    return NextResponse.json({ error: `«${gemello.nome}» esiste già.` }, { status: 409 });
  }

  // Lo slug invece può collidere anche fra nomi diversi («Deluxy Fiori» e
  // «Deluxy, fiori»): lì non si rifiuta, si numera.
  let slug = base;
  for (let i = 2; await prisma.maison.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;

  const ultimo = await prisma.maison.findFirst({ orderBy: { ordine: "desc" } });
  const creato = await prisma.maison.create({
    data: { nome, slug, ordine: (ultimo?.ordine ?? 0) + 1 },
  });

  // Nessuna riga di budget e nessuna percentuale: un brand nuovo nasce a zero e
  // le pagine lo dicono, invece di ereditare numeri di qualcun altro.
  return NextResponse.json({ ok: true, id: creato.id, slug: creato.slug });
}

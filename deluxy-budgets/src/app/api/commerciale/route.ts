import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Il **budget delle linee di vendita, mese per mese**: valore in € e nuovi
// clienti. Fino al 23/08/2026 `TargetLinea` esisteva a database ma non si
// scriveva da nessuna parte — i numeri erano entrati con il seed, e `/commerciale`
// li mostrava soltanto (per giunta il dettaglio mensile compariva solo quando
// Scout non rispondeva, cioè proprio quando la pagina era in avaria).

// ⚠️ Qui **i mesi chiusi si scrivono**, al contrario di `/api/spese`. Non è una
// dimenticanza: là la percentuale governa una spesa che nel mese passato è già
// uscita, e riscriverla dopo non sposta un euro. Qui invece la casella è un
// **obiettivo commerciale**, e il caso vero che si è presentato è l'opposto —
// un budget mai scritto (sei mesi vuoti su Deluxy.it, trovati il 23/08/2026)
// che va riempito adesso. Bloccare i mesi chiusi impedirebbe proprio la
// correzione che serve. La pagina segna quali mesi sono chiusi, così chi
// riscrive sa che sta toccando un periodo già confrontato col consuntivo.

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const year = Number(body?.year);
  const entries = Array.isArray(body?.entries) ? body.entries : null;
  if (!year || !entries) {
    return NextResponse.json({ error: "payload non valido" }, { status: 400 });
  }

  // I valori impossibili si **rifiutano dichiarandolo**, non si aggiustano: una
  // correzione silenziosa non si scopre mai (lezione già pagata su `/api/spese`,
  // dove un `Math.min` scriveva 100 mentre a schermo restava 150).
  let rifiutati = 0;
  let scritti = 0;

  for (const e of entries) {
    const lineaId = String(e?.lineaId ?? "");
    const month = Number(e?.month);
    const valore = Number(e?.valore);
    const clienti = Number(e?.clienti);
    if (!lineaId || !Number.isInteger(month) || month < 1 || month > 12) {
      rifiutati++;
      continue;
    }
    // Un budget negativo non esiste: sarebbe una vendita al contrario.
    if (!Number.isFinite(valore) || valore < 0 || !Number.isFinite(clienti) || clienti < 0) {
      rifiutati++;
      continue;
    }
    await prisma.targetLinea.upsert({
      where: { year_lineaId_month: { year, lineaId, month } },
      update: { valore, clienti },
      create: { year, lineaId, month, valore, clienti },
    });
    scritti++;
  }

  return NextResponse.json({ ok: true, scritti, rifiutati });
}

// Una linea di **Scout** che a budget non esiste ancora. Scout è il master
// dell'elenco: qui non si inventa una linea, si apre la riga di budget per una
// che là c'è già — altrimenti l'unico modo di dare un budget a una linea nuova
// sarebbe aprire il database, ed è la ragione per cui nessuno lo faceva.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const nome = String(body?.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "Serve il nome della linea." }, { status: 400 });
  if (nome.length > 80) return NextResponse.json({ error: "Nome troppo lungo." }, { status: 400 });

  const slugBase =
    nome
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "linea";

  const gemella = await prisma.lineaCommerciale.findFirst({
    where: { nome: { equals: nome, mode: "insensitive" } },
  });
  if (gemella) {
    return NextResponse.json({ error: `«${gemella.nome}» ha già una riga di budget.` }, { status: 409 });
  }

  let slug = slugBase;
  for (let i = 2; await prisma.lineaCommerciale.findUnique({ where: { slug } }); i++) slug = `${slugBase}-${i}`;

  const ultima = await prisma.lineaCommerciale.findFirst({ orderBy: { ordine: "desc" } });
  const creata = await prisma.lineaCommerciale.create({
    data: { nome, slug, ordine: (ultima?.ordine ?? 0) + 1 },
  });

  // Nasce **a zero e senza righe**: un budget non si eredita da nessuno, e
  // dodici caselle vuote dicono la verità meglio di dodici caselle inventate.
  return NextResponse.json({ ok: true, id: creata.id, slug: creata.slug });
}

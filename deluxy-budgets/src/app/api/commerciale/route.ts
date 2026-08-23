import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { meseChiuso } from "@/lib/periodo";

// Il **budget delle linee di vendita, mese per mese**: valore in € e nuovi
// clienti. Fino al 23/08/2026 `TargetLinea` esisteva a database ma non si
// scriveva da nessuna parte — i numeri erano entrati con il seed, e `/commerciale`
// li mostrava soltanto (per giunta il dettaglio mensile compariva solo quando
// Scout non rispondeva, cioè proprio quando la pagina era in avaria).

// ⚠️ **I mesi già passati si rifiutano**, come in `/api/spese` (decisione
// dell'utente, 23/08/2026: «i dati dei mesi passati non possono essere
// inseriti»). Per un breve tempo qui erano scrivibili — serviva a riempire i
// mesi rimasti vuoti — ma da quando sotto ogni mese chiuso c'è il **consuntivo**
// quella ragione è caduta: il numero che conta per un mese passato è quello che
// è successo, non quello che si era previsto.
//
// E si rifiutano **qui**, non solo togliendo le caselle dal form: un campo che
// non c'è è una cortesia verso chi guarda la pagina, non un blocco. La stessa
// PUT partita da una scheda rimasta aperta da ieri, o rigiocata a mano,
// riscriverebbe un mese già chiuso.

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
  const mesiChiusiIgnorati: number[] = [];

  for (const e of entries) {
    const lineaId = String(e?.lineaId ?? "");
    const month = Number(e?.month);
    const valore = Number(e?.valore);
    const clienti = Number(e?.clienti);
    if (!lineaId || !Number.isInteger(month) || month < 1 || month > 12) {
      rifiutati++;
      continue;
    }
    if (meseChiuso(year, month)) {
      if (!mesiChiusiIgnorati.includes(month)) mesiChiusiIgnorati.push(month);
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

  // Si dichiara quello che **non** è stato scritto: un `ok` secco su una
  // richiesta scartata a metà è il modo più veloce per credere di aver salvato.
  return NextResponse.json({
    ok: true,
    scritti,
    rifiutati,
    mesiChiusiIgnorati: mesiChiusiIgnorati.sort((a, b) => a - b),
  });
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

// Il **collegamento a Finance**: quali tipologie di fatturato compongono il
// consuntivo di ogni linea. Sta a parte dal PUT perché cambia solo **quello che
// si legge** — il budget scritto non si tocca — e mescolare le due cose vorrebbe
// dire che salvare un collegamento rischia di riscrivere dodici caselle.
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const mappature = Array.isArray(body?.mappature) ? body.mappature : null;
  if (!mappature) return NextResponse.json({ error: "payload non valido" }, { status: 400 });

  let scritte = 0;
  for (const m of mappature) {
    const lineaId = String(m?.lineaId ?? "");
    if (!lineaId) continue;
    // Arriva come testo «A, B, C» dal form: qui diventa un JSON array. Vuoto =
    // `null`, cioè «cerca una tipologia che si chiami come la linea» — che è la
    // stessa regola di `TipologiaServizio.vociFinance`.
    const lista = String(m?.vociFinance ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    await prisma.lineaCommerciale.update({
      where: { id: lineaId },
      data: { vociFinance: lista.length > 0 ? JSON.stringify(lista) : null },
    });
    scritte++;
  }

  return NextResponse.json({ ok: true, scritte });
}

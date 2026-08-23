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

// Il **ROS obiettivo** del brand: quanti euro di vendite deve muovere ogni euro
// di pubblicità. Da qui si stima il monte pubblicitario dell'anno, quindi è un
// numero che sposta il P&L: si valida invece di fidarsi del form.
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "id mancante" }, { status: 400 });

  // `null` = «usa il predefinito», ed è diverso da zero: uno zero qui
  // farebbe una divisione per zero e un monte pubblicitario infinito.
  //
  // ⚠️ E **assente è diverso da null**: chi manda solo l'interruttore della
  // pubblicità non sta dicendo niente sul ROS, e trattare la sua assenza come
  // «rimettilo al predefinito» cancellerebbe un valore scelto senza che nessuno
  // l'abbia chiesto.
  const grezzo = body?.rosObiettivo;
  const rosToccato = grezzo !== undefined;
  let ros: number | null = null;
  if (grezzo !== null && grezzo !== undefined && grezzo !== "") {
    const n = Number(grezzo);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json(
        { error: "Il ROS dev'essere un numero maggiore di zero, oppure vuoto per usare il predefinito." },
        { status: 400 }
      );
    }
    if (n > 100) {
      return NextResponse.json(
        { error: "Un ROS sopra 100 vorrebbe dire pubblicità quasi a zero: se è voluto, scrivilo più basso e alza il budget." },
        { status: 400 }
      );
    }
    ros = n;
  }

  // **Fa pubblicita, si o no.** Si manda solo quando lo si cambia: assente =
  // non si tocca, cosi il salvataggio del ROS non spegne la pubblicita.
  const fa = body?.faPubblicita;
  const faPubblicita = typeof fa === "boolean" ? fa : undefined;

  const m = await prisma.maison.update({
    where: { id },
    data: {
      ...(rosToccato ? { rosObiettivo: ros } : {}),
      ...(faPubblicita === undefined ? {} : { faPubblicita }),
    },
  });

  // Spegnendo la pubblicita si **azzerano anche le quote**. Il monte gia va a
  // zero da solo, ma lasciare a database un 218,4% che nessuno puo piu vedere
  // vuol dire che il giorno in cui qualcuno riaccende l interruttore si ritrova
  // addosso una ripartizione sbagliata di cui non sa niente.
  let quoteAzzerate = 0;
  if (faPubblicita === false) {
    const esito = await prisma.advPercent.updateMany({
      where: { maisonId: id, percent: { not: 0 } },
      data: { percent: 0 },
    });
    quoteAzzerate = esito.count;
  }

  return NextResponse.json({
    ok: true,
    rosObiettivo: m.rosObiettivo,
    faPubblicita: m.faPubblicita,
    quoteAzzerate,
  });
}

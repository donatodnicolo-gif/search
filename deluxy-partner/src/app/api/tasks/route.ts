import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida, appOrigine, ipRichiesta } from "@/lib/apiauth";
import { normPriorita } from "@/lib/tasks";

// API pubblica: attività finance (task) condivise con gli altri progetti Deluxy.
//
//   GET  /api/tasks?stato=aperto&priorita=alta&partner=<nome|id>   elenco (filtri facoltativi)
//   GET  /api/tasks?id=<id>                                        dettaglio
//   POST /api/tasks   body JSON: { titolo, note?, priorita?, scadenza?(YYYY-MM-DD),
//                                   partner?(nome|id), riferimento?, idEsterno? }
//        → crea (o aggiorna, se stessa app+idEsterno) un task. Ritorna id.
//   PATCH /api/tasks  body JSON: { id, stato }   → cambia stato (aperto|in_corso|fatto)
//   Header: X-API-Key: <chiave>   (la stessa di /api/verifiche)
//   Header: X-App: <nome-app>     (usato come origine del task e nello storico)

type Task = Awaited<ReturnType<typeof prisma.taskFinance.findFirst>>;

function pubblico(t: NonNullable<Task>) {
  return {
    id: t.id,
    titolo: t.titolo,
    note: t.note,
    stato: t.stato,
    priorita: normPriorita(t.priorita), // P0 | P1 | P2
    assegnatario: t.assegnatario,
    scadenza: t.scadenza?.toISOString().slice(0, 10) ?? null,
    partner: t.partnerId ? { id: t.partnerId, nome: t.partnerNome } : null,
    riferimento: t.riferimento,
    origineApp: t.origineApp,
    idEsterno: t.idEsterno,
    completatoIl: t.completatoIl?.toISOString() ?? null,
    creatoIl: t.createdAt.toISOString(),
    url: `https://deluxy-partner.vercel.app/tasks`,
  };
}

async function risolviPartner(rif: string | undefined | null) {
  if (!rif) return null;
  return (
    (await prisma.partner.findUnique({ where: { id: rif } })) ??
    (await prisma.partner.findFirst({ where: { nome: { equals: rif, mode: "insensitive" } } }))
  );
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (!(await chiaveApiValida(req))) {
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }
  const id = sp.get("id")?.trim();
  if (id) {
    const t = await prisma.taskFinance.findUnique({ where: { id } });
    if (!t) return NextResponse.json({ errore: "Task non trovato." }, { status: 404 });
    return NextResponse.json(pubblico(t));
  }
  const partner = await risolviPartner(sp.get("partner")?.trim());
  const stato = sp.get("stato")?.trim() || undefined;
  const priorita = sp.get("priorita")?.trim() ? normPriorita(sp.get("priorita")) : undefined;
  const tasks = await prisma.taskFinance.findMany({
    where: {
      ...(stato ? { stato } : {}),
      ...(priorita ? { priorita } : {}),
      ...(partner ? { partnerId: partner.id } : {}),
    },
    orderBy: [{ stato: "asc" }, { scadenza: "asc" }],
    take: 500,
  });
  return NextResponse.json({ conteggio: tasks.length, tasks: tasks.map(pubblico) });
}

export async function POST(req: NextRequest) {
  if (!(await chiaveApiValida(req))) {
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }
  let body: {
    titolo?: string;
    note?: string;
    priorita?: string;
    assegnatario?: string;
    scadenza?: string;
    partner?: string;
    riferimento?: string;
    idEsterno?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errore: "Body JSON non valido." }, { status: 400 });
  }
  const titolo = body.titolo?.trim();
  if (!titolo) return NextResponse.json({ errore: "Campo 'titolo' obbligatorio." }, { status: 400 });

  const origineApp = appOrigine(req);
  const partner = await risolviPartner(body.partner);
  // accetta P0/P1/P2 (o i vecchi alta/media/bassa, mappati)
  const priorita = normPriorita(body.priorita);
  const scadenza = body.scadenza ? new Date(body.scadenza + "T00:00:00.000Z") : null;
  const dati = {
    titolo,
    note: body.note?.trim() || null,
    priorita,
    assegnatario: body.assegnatario?.trim() || null,
    scadenza: scadenza && !isNaN(scadenza.getTime()) ? scadenza : null,
    partnerId: partner?.id ?? null,
    partnerNome: partner?.nome ?? null,
    riferimento: body.riferimento?.trim() || null,
    origineApp,
    idEsterno: body.idEsterno?.trim() || null,
  };

  // idempotente per (origineApp, idEsterno) quando forniti
  let t;
  if (origineApp && dati.idEsterno) {
    t = await prisma.taskFinance.upsert({
      where: { origineApp_idEsterno: { origineApp, idEsterno: dati.idEsterno } },
      create: dati,
      update: dati,
    });
  } else {
    t = await prisma.taskFinance.create({ data: dati });
  }
  await prisma.richiestaVerifica.create({
    data: { origine: origineApp, queryPartner: `task: ${titolo}`.slice(0, 200), esito: "trovato", rispostaSintesi: `task ${t.id}`, ip: ipRichiesta(req) },
  });
  return NextResponse.json(pubblico(t), { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!(await chiaveApiValida(req))) {
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }
  let body: { id?: string; stato?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errore: "Body JSON non valido." }, { status: 400 });
  }
  const id = body.id?.trim();
  const stato = body.stato?.trim();
  if (!id || !stato) return NextResponse.json({ errore: "Campi 'id' e 'stato' obbligatori." }, { status: 400 });
  if (!["aperto", "in_corso", "fatto"].includes(stato)) {
    return NextResponse.json({ errore: "Stato non valido: aperto | in_corso | fatto." }, { status: 400 });
  }
  const esiste = await prisma.taskFinance.findUnique({ where: { id } });
  if (!esiste) return NextResponse.json({ errore: "Task non trovato." }, { status: 404 });
  const t = await prisma.taskFinance.update({
    where: { id },
    data: { stato, completatoIl: stato === "fatto" ? new Date() : null },
  });
  return NextResponse.json(pubblico(t));
}

import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { STATI_CAMPAGNA } from "@/lib/dominio";

// GET /api/v1/campagne?brand=&stato= — elenco campagne con metriche ultimi 30 gg
export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;

  const p = req.nextUrl.searchParams;
  const giorni30 = new Date(Date.now() - 30 * 86_400_000);
  const campagne = await prisma.campagna.findMany({
    where: {
      ...(p.get("brand") ? { brand: p.get("brand")! } : {}),
      ...(p.get("stato") ? { stato: p.get("stato")! } : {}),
    },
    orderBy: { creataIl: "desc" },
    include: { metriche: { where: { data: { gte: giorni30 } }, orderBy: { data: "asc" } } },
  });
  return NextResponse.json({ campagne });
}

// POST /api/v1/campagne — registra o aggiorna (per idEsterno) una campagna.
// Body: { nome*, brand?, canale?, stato?, obiettivo?, budgetGiornaliero?, idEsterno?, inizio?, fine?, note? }
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }
  if (!body.nome) return erroreApi(400, "Campo obbligatorio: nome");
  if (body.stato && !(STATI_CAMPAGNA as readonly string[]).includes(body.stato)) {
    return erroreApi(400, `stato non valido: ${body.stato}`);
  }

  const dati = {
    nome: String(body.nome),
    brand: body.brand ?? "flowers",
    canale: body.canale ?? "google_ads",
    stato: body.stato ?? "attiva",
    obiettivo: body.obiettivo ?? null,
    budgetGiornaliero: body.budgetGiornaliero != null ? Number(body.budgetGiornaliero) : null,
    idEsterno: body.idEsterno ?? null,
    inizio: body.inizio ? new Date(body.inizio) : null,
    fine: body.fine ? new Date(body.fine) : null,
    note: body.note ?? null,
  };

  // Stessa campagna rimandata (per idEsterno): si aggiorna invece di duplicare.
  const esistente = body.idEsterno
    ? await prisma.campagna.findFirst({ where: { idEsterno: String(body.idEsterno) } })
    : null;
  const campagna = esistente
    ? await prisma.campagna.update({ where: { id: esistente.id }, data: dati })
    : await prisma.campagna.create({ data: dati });
  return NextResponse.json({ campagna }, { status: esistente ? 200 : 201 });
}

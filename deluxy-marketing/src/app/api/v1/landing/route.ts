import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { registra } from "@/lib/registro";

// GET /api/v1/landing?brand=&stato= — registro landing con campagne e ultime performance
export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;
  const p = req.nextUrl.searchParams;
  const landing = await prisma.landingPage.findMany({
    where: {
      ...(p.get("brand") ? { brand: p.get("brand")! } : {}),
      ...(p.get("stato") ? { stato: p.get("stato")! } : {}),
    },
    orderBy: [{ brand: "asc" }, { url: "asc" }],
    include: {
      campagne: { select: { id: true, nome: true, stato: true, canale: true } },
      metriche: { orderBy: { periodo: "desc" }, take: 3 },
    },
  });
  return NextResponse.json({ landing });
}

// POST /api/v1/landing — upsert per url; con "metriche" registra anche le performance.
// Body: { url*, nome?, brand?, lingua?, tipo?, scopo?, gemellaUrl?, stato?, scorecard?, note?,
//         verificata?: bool, metriche?: [{ periodo*, canale?, clic?, costo?, sessioni?, conversioni?, ricavi?, tassoConversione?, note? }] }
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;
  let body;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }
  if (!body.url) return erroreApi(400, "Campo obbligatorio: url");

  const dati = {
    nome: body.nome ?? undefined,
    brand: body.brand ?? undefined,
    lingua: body.lingua ?? undefined,
    tipo: body.tipo ?? undefined,
    scopo: body.scopo ?? undefined,
    gemellaUrl: body.gemellaUrl ?? undefined,
    stato: body.stato ?? undefined,
    scorecard: body.scorecard != null ? Math.round(Number(body.scorecard)) : undefined,
    note: body.note ?? undefined,
    ...(body.verificata ? { verificataIl: new Date() } : {}),
  };
  const landing = await prisma.landingPage.upsert({
    where: { url: String(body.url) },
    create: { ...dati, url: String(body.url), brand: body.brand ?? "cross" },
    update: dati,
  });

  let metricheSalvate = 0;
  if (Array.isArray(body.metriche)) {
    for (const m of body.metriche) {
      if (!m?.periodo) continue;
      const canale = m.canale ?? "totale";
      const valori = {
        clic: m.clic != null ? Math.round(Number(m.clic)) : null,
        costo: m.costo != null ? Number(m.costo) : null,
        sessioni: m.sessioni != null ? Math.round(Number(m.sessioni)) : null,
        conversioni: m.conversioni != null ? Number(m.conversioni) : null,
        ricavi: m.ricavi != null ? Number(m.ricavi) : null,
        tassoConversione: m.tassoConversione != null ? Number(m.tassoConversione) : null,
        note: m.note ?? null,
      };
      await prisma.metricaLanding.upsert({
        where: { landingId_periodo_canale: { landingId: landing.id, periodo: String(m.periodo), canale } },
        create: { landingId: landing.id, periodo: String(m.periodo), canale, ...valori },
        update: valori,
      });
      metricheSalvate++;
    }
  }
  await registra({
    autore: cliente.nome,
    tipo: "modifica",
    entita: "landing",
    entitaId: landing.id,
    titolo: `Landing aggiornata via API: ${landing.url}`,
    dettaglio: metricheSalvate ? `${metricheSalvate} periodi di performance` : null,
  });
  return NextResponse.json({ landing, metricheSalvate }, { status: 201 });
}

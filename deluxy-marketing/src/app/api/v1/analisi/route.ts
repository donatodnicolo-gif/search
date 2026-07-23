import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { BRANDS, TIPI_ANALISI } from "@/lib/dominio";

// GET /api/v1/analisi?brand=&tipo=&da=AAAA-MM-GG — elenco analisi depositate
export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;

  const p = req.nextUrl.searchParams;
  const da = p.get("da");
  const analisi = await prisma.analisi.findMany({
    where: {
      ...(p.get("brand") ? { brand: p.get("brand")! } : {}),
      ...(p.get("tipo") ? { tipo: p.get("tipo")! } : {}),
      ...(da ? { dataAnalisi: { gte: new Date(da) } } : {}),
    },
    orderBy: { dataAnalisi: "desc" },
    take: Number(p.get("limite") ?? 100),
    include: { azioni: { select: { id: true, titolo: true, stato: true } } },
  });
  return NextResponse.json({ analisi });
}

// POST /api/v1/analisi — deposita un'analisi (le sessioni Claude la usano a fine lavoro).
// Body: { titolo*, sintesi*, tipo?, brand?, canale?, esito?, fileDrive?, dataAnalisi?, note?, origine?,
//         azioni?: [{ titolo*, descrizione?, priorita?, owner?, scadenza?, fileDrive? }] }
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }
  if (!body.titolo || !body.sintesi) return erroreApi(400, "Campi obbligatori: titolo, sintesi");
  if (body.tipo && !(TIPI_ANALISI as readonly string[]).includes(body.tipo)) {
    return erroreApi(400, `tipo non valido: ${body.tipo}`);
  }
  if (body.brand && !(BRANDS as readonly string[]).includes(body.brand)) {
    return erroreApi(400, `brand non valido: ${body.brand}`);
  }

  const azioniInput = Array.isArray(body.azioni) ? body.azioni : [];
  const analisi = await prisma.analisi.create({
    data: {
      titolo: String(body.titolo),
      sintesi: String(body.sintesi),
      tipo: body.tipo ?? "analisi",
      brand: body.brand ?? "cross",
      canale: body.canale ?? null,
      esito: body.esito ?? null,
      fileDrive: body.fileDrive ?? null,
      dataAnalisi: body.dataAnalisi ? new Date(body.dataAnalisi) : new Date(),
      origine: body.origine ?? cliente.nome,
      note: body.note ?? null,
      azioni: {
        create: azioniInput
          .filter((a: { titolo?: string }) => a?.titolo)
          .map((a: Record<string, string | undefined>) => ({
            titolo: String(a.titolo),
            descrizione: a.descrizione ?? null,
            brand: body.brand ?? "cross",
            canale: a.canale ?? body.canale ?? null,
            priorita: a.priorita ?? "media",
            owner: a.owner ?? "ai",
            scadenza: a.scadenza ? new Date(a.scadenza) : null,
            fileDrive: a.fileDrive ?? null,
            eventi: {
              create: { tipo: "creazione", autore: cliente.nome, testo: "Creata insieme all'analisi via API" },
            },
          })),
      },
    },
    include: { azioni: { select: { id: true, titolo: true } } },
  });
  return NextResponse.json({ analisi }, { status: 201 });
}

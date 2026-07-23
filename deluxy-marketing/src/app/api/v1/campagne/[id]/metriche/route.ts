import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

// POST /api/v1/campagne/:id/metriche — upsert delle metriche giornaliere.
// Body: { metriche: [{ data*: "AAAA-MM-GG", spesa?, impression?, click?, conversioni?, ricavi? }] }
// Rimandare gli stessi giorni aggiorna i valori: nessun duplicato.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;
  const { id } = await ctx.params;

  const campagna = await prisma.campagna.findUnique({ where: { id } });
  if (!campagna) return erroreApi(404, "Campagna non trovata");

  let body;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }
  const righe = Array.isArray(body.metriche) ? body.metriche : [body];
  let salvate = 0;
  for (const r of righe) {
    if (!r?.data) continue;
    const giorno = new Date(r.data);
    if (isNaN(giorno.getTime())) continue;
    giorno.setUTCHours(0, 0, 0, 0);
    const valori = {
      spesa: r.spesa != null ? Number(r.spesa) : null,
      impression: r.impression != null ? Math.round(Number(r.impression)) : null,
      click: r.click != null ? Math.round(Number(r.click)) : null,
      conversioni: r.conversioni != null ? Number(r.conversioni) : null,
      ricavi: r.ricavi != null ? Number(r.ricavi) : null,
    };
    await prisma.metricaCampagna.upsert({
      where: { campagnaId_data: { campagnaId: id, data: giorno } },
      create: { campagnaId: id, data: giorno, ...valori },
      update: valori,
    });
    salvate++;
  }
  if (salvate === 0) return erroreApi(400, "Nessuna metrica valida: serve almeno { data: 'AAAA-MM-GG' }");
  return NextResponse.json({ salvate }, { status: 201 });
}

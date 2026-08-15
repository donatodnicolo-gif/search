import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

// POST /api/v1/ingest/annuncio-giorni — la storia giorno per giorno degli
// ANNUNCI. Gemella di keyword-giorni: è quella che fa vedere come va un
// annuncio per finestra, invece della sola fotografia a 30 giorni del giro
// `copy`.
//
// Body: { account?, righe: [{ idEsterno*, campagna*, gruppo?, data*,
//         spesa?, impressioni?, clic?, conversioni?, ricavi? }] }
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body: { account?: string; canale?: string; righe?: Record<string, unknown>[] };
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }
  const righe = Array.isArray(body.righe) ? body.righe : [];
  if (righe.length === 0) return erroreApi(400, "Niente da importare: atteso { righe: [...] }");

  const numero = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const intero = (v: unknown) => (numero(v) != null ? Math.round(numero(v)!) : null);

  const valide = righe
    .map((r) => {
      const data = typeof r.data === "string" ? new Date(`${r.data}T00:00:00.000Z`) : null;
      if (!r.idEsterno || !r.campagna || !data || isNaN(data.getTime())) return null;
      return {
        idEsterno: String(r.idEsterno),
        campagna: String(r.campagna),
        gruppo: r.gruppo ? String(r.gruppo) : null,
        data,
        spesa: numero(r.spesa),
        impressioni: intero(r.impressioni),
        clic: intero(r.clic),
        conversioni: numero(r.conversioni),
        ricavi: numero(r.ricavi),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  // ⚠️ Mai una query per riga: lettura in blocco, createMany per le nuove,
  // update solo dove un numero è cambiato (i giorni recenti si rimandano a
  // ogni giro per le conversioni che maturano tardi, e quasi tutte le righe
  // arrivano identiche).
  const chiave = (x: { idEsterno: string; data: Date }) => `${x.idEsterno}|${x.data.toISOString()}`;
  const esistenti = await prisma.metricaAnnuncio.findMany({
    where: {
      idEsterno: { in: [...new Set(valide.map((r) => r.idEsterno))] },
      data: { in: [...new Set(valide.map((r) => r.data.getTime()))].map((t) => new Date(t)) },
    },
  });
  const perChiave = new Map(esistenti.map((e) => [chiave(e), e]));

  const nuove = valide.filter((r) => !perChiave.has(chiave(r)));
  if (nuove.length > 0) {
    await prisma.metricaAnnuncio.createMany({ data: nuove, skipDuplicates: true });
  }

  let aggiornate = 0;
  for (const r of valide) {
    const c = perChiave.get(chiave(r));
    if (!c) continue;
    const cambia =
      c.spesa !== r.spesa ||
      c.impressioni !== r.impressioni ||
      c.clic !== r.clic ||
      c.conversioni !== r.conversioni ||
      c.ricavi !== r.ricavi ||
      c.gruppo !== r.gruppo;
    if (!cambia) continue;
    await prisma.metricaAnnuncio.update({
      where: { id: c.id },
      data: {
        gruppo: r.gruppo,
        spesa: r.spesa,
        impressioni: r.impressioni,
        clic: r.clic,
        conversioni: r.conversioni,
        ricavi: r.ricavi,
      },
    });
    aggiornate++;
  }

  await prisma.ricezioneDati.create({
    data: {
      fonte: body.canale ?? "google_ads",
      account: body.account ? String(body.account) : null,
      tipo: "annuncio-giorni",
      chiave: cliente.nome,
      righe: righe.length,
      nuove: nuove.length,
      aggiornate,
      scartate: righe.length - valide.length,
      esito: "ok",
    },
  });

  return NextResponse.json(
    { nuove: nuove.length, aggiornate, invariate: valide.length - nuove.length - aggiornate },
    { status: 201 }
  );
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const LIVELLI = ["RAGGIUNGIBILE", "SFIDANTE", "IRRAGGIUNGIBILE"];

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const year = Number(body?.year);
  if (!year) return NextResponse.json({ error: "anno mancante" }, { status: 400 });

  const scenari = Array.isArray(body?.scenari) ? body.scenari : [];
  for (const s of scenari) {
    if (!LIVELLI.includes(s?.livello)) continue;
    // Il raggiungibile resta sempre il budget pubblicato: moltiplicatore 1.
    const moltiplicatore =
      s.livello === "RAGGIUNGIBILE" ? 1 : Math.max(0.5, Number(s.moltiplicatore) || 1);
    const premio = Math.max(0, Number(s.premio) || 0);
    await prisma.scenarioConfig.upsert({
      where: { year_livello: { year, livello: s.livello } },
      update: { moltiplicatore, premio },
      create: { year, livello: s.livello, moltiplicatore, premio },
    });
  }

  const costi = Array.isArray(body?.costi) ? body.costi : [];
  for (const c of costi) {
    if (typeof c?.id !== "string") continue;
    await prisma.costConfig.update({
      where: { id: c.id },
      data: { valore: Math.max(0, Number(c.valore) || 0) },
    }).catch(() => null);
  }

  return NextResponse.json({ ok: true });
}

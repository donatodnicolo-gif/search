import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const year = Number(body?.year);
  const entries = Array.isArray(body?.entries) ? body.entries : null;
  if (!year || !entries) {
    return NextResponse.json({ error: "payload non valido" }, { status: 400 });
  }

  for (const e of entries) {
    const maisonId = String(e?.maisonId ?? "");
    const month = Number(e?.month);
    const percent = Math.min(100, Math.max(0, Number(e?.percent) || 0));
    if (!maisonId || month < 1 || month > 12) continue;
    await prisma.advPercent.upsert({
      where: { year_maisonId_month: { year, maisonId, month } },
      update: { percent },
      create: { year, maisonId, month, percent },
    });
  }
  return NextResponse.json({ ok: true });
}

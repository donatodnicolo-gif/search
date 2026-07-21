import { NextRequest, NextResponse } from "next/server";
import { scegliLivello } from "@/lib/applica-livelli";
import { notificaProgetto, type EventoCallback } from "@/lib/callback";
import { prisma } from "@/lib/db";
import { isPriorita } from "@/lib/priorita";
import { isStato } from "@/lib/stati";

// Azioni della UI su una task (protetta dalla sessione a cookie via middleware).
// PATCH: cambia stato/priorità o archivia. Body: { stato?, priorita?, attiva? }.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errore: "Body JSON non valido" }, { status: 400 });
  }

  const esistente = await prisma.task.findUnique({ where: { id } });
  if (!esistente) return NextResponse.json({ errore: "Task non trovata" }, { status: 404 });

  // Scelta del livello di priorità effettivo (il team sceglie quale data vale).
  if (typeof body.livelloId === "string" && body.livelloId) {
    const ok = await scegliLivello(id, body.livelloId);
    if (!ok) return NextResponse.json({ errore: "Livello non valido" }, { status: 400 });
    const t = await prisma.task.update({
      where: { id },
      data: { ultimoAttore: "ui", revisione: { increment: 1 } },
      include: { livelli: true },
    });
    await notificaProgetto(t, "aggiornata");
    return NextResponse.json({ ok: true, id: t.id, priorita: t.priorita, scadenza: t.scadenza, livelloSceltoId: t.livelloSceltoId });
  }

  const data: Record<string, unknown> = {};
  if (body.stato !== undefined) {
    if (!isStato(body.stato)) return NextResponse.json({ errore: "stato non valido" }, { status: 400 });
    data.stato = body.stato;
    data.completataIl = body.stato === "completata" ? (esistente.completataIl ?? new Date()) : null;
  }
  if (body.priorita !== undefined) {
    if (!isPriorita(body.priorita)) return NextResponse.json({ errore: "priorita non valida" }, { status: 400 });
    data.priorita = body.priorita;
  }
  if (typeof body.attiva === "boolean") data.attiva = body.attiva;

  // La modifica arriva dal team (UI): l'attore è "ui", quindi il progetto di
  // origine va sempre richiamato per allinearsi.
  data.ultimoAttore = "ui";
  data.revisione = { increment: 1 };

  const task = await prisma.task.update({ where: { id }, data });

  let evento: EventoCallback = "aggiornata";
  if (data.attiva === false) evento = "archiviata";
  else if (task.stato === "completata") evento = "completata";
  await notificaProgetto(task, evento);

  return NextResponse.json({ ok: true, id: task.id, stato: task.stato, attiva: task.attiva });
}

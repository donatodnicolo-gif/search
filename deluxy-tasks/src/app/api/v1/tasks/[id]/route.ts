import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { sincronizzaLivelli } from "@/lib/applica-livelli";
import { notificaProgetto } from "@/lib/callback";
import { prisma } from "@/lib/db";
import { deveNotificareOrigine } from "@/lib/sync";
import { serializzaTask, validaTask } from "@/lib/task-api";

// Risolve una task dal path: accetta l'id nativo di Tasks.
async function trova(id: string) {
  return prisma.task.findUnique({ where: { id }, include: { livelli: true } });
}

// GET /api/v1/tasks/:id
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;
  const { id } = await ctx.params;
  const task = await trova(id);
  if (!task) return erroreApi(404, "Task non trovata");
  return NextResponse.json(serializzaTask(task));
}

// PATCH /api/v1/tasks/:id — modifica mirata (richiede scrittura).
// Utile per "completa questa task", "cambia scadenza", ecc.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;
  const { id } = await ctx.params;

  const esistente = await trova(id);
  if (!esistente) return erroreApi(404, "Task non trovata");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }

  const risultato = validaTask(body, false);
  if ("errore" in risultato) return erroreApi(400, risultato.errore);
  // livelli/livelloSceltoNota/extra non sono colonne scalari: gestiti a parte.
  const { extra, livelli, livelloSceltoNota, ...dati } = risultato.dati;
  const attore = typeof body.attore === "string" && body.attore.trim() ? body.attore.trim() : client.nome;

  // Coerenza stato ↔ completataIl: completando si stampa la data, riaprendo si azzera.
  let completataIl: Date | null | undefined;
  if (dati.stato === "completata") completataIl = esistente.completataIl ?? new Date();
  else if (dati.stato && dati.stato !== "completata") completataIl = null;

  await prisma.task.update({
    where: { id },
    data: {
      ...dati,
      ultimoAttore: attore,
      revisione: { increment: 1 },
      ...(extra !== undefined ? { extra: extra as Prisma.InputJsonValue } : {}),
      ...(completataIl !== undefined ? { completataIl } : {}),
    },
  });

  // Se la PATCH porta nuovi livelli, li sostituiamo e riallineiamo l'effettivo.
  if (livelli !== undefined) await sincronizzaLivelli(id, livelli, livelloSceltoNota);

  const task = (await prisma.task.findUnique({ where: { id }, include: { livelli: true } }))!;
  const evento = task.stato === "completata" ? "completata" : "aggiornata";
  if (deveNotificareOrigine(task.sistema, attore)) await notificaProgetto(task, evento);
  return NextResponse.json(serializzaTask(task));
}

// DELETE /api/v1/tasks/:id — archiviazione (soft delete): attiva=false.
// Non cancella davvero, così l'app di origine può ancora ritrovarla.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;
  const { id } = await ctx.params;

  const esistente = await trova(id);
  if (!esistente) return erroreApi(404, "Task non trovata");

  const attore = req.nextUrl.searchParams.get("attore")?.trim() || client.nome;
  const task = await prisma.task.update({
    where: { id },
    data: { attiva: false, ultimoAttore: attore, revisione: { increment: 1 } },
  });
  if (deveNotificareOrigine(task.sistema, attore)) await notificaProgetto(task, "archiviata");
  return NextResponse.json({ esito: "archiviata", id });
}

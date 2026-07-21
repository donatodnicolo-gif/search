import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { serializzaTask } from "@/lib/task-api";

// GET /api/v1/tasks/changes?since=<revisione>&sistema=&utente=&perPage=
// Feed incrementale: restituisce le task con revisione > since, così un
// progetto può stabilire "cosa è cambiato" dall'ultima sincronizzazione senza
// riscaricare tutto. Include le archiviate (attiva=false) per propagarle.
//
// Uso tipico: il progetto tiene l'ultimo `cursore` ricevuto e lo ripassa come
// `since` alla chiamata successiva.
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const since = Math.max(0, Number(p.get("since")) || 0);
  const perPagina = Math.min(500, Math.max(1, Number(p.get("perPage")) || 200));

  const where: Prisma.TaskWhereInput = { revisione: { gt: since } };
  const sistema = p.get("sistema")?.trim();
  if (sistema) where.sistema = sistema;
  const utente = p.get("utente")?.trim();
  if (utente) where.utenteEmail = utente.toLowerCase();

  const dati = await prisma.task.findMany({
    where,
    include: { livelli: true },
    orderBy: { revisione: "asc" },
    take: perPagina,
  });

  // Nuovo cursore = revisione più alta restituita (o quella richiesta se vuoto).
  const cursore = dati.length ? dati[dati.length - 1].revisione : since;
  // Se il lotto è pieno potrebbero esserci altre modifiche oltre il cursore.
  const altre = dati.length === perPagina;

  // Se il progetto si identifica (sistema), memorizziamo il cursore raggiunto.
  if (sistema) {
    await prisma.progetto
      .updateMany({ where: { sistema }, data: { ultimoCursore: cursore } })
      .catch(() => {});
  }

  return NextResponse.json({
    cursore,
    altre,
    conteggio: dati.length,
    dati: dati.map(serializzaTask),
  });
}

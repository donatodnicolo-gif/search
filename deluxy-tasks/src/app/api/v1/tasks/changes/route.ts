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
  const sinceId = (p.get("sinceId") ?? "").trim();
  const perPagina = Math.min(500, Math.max(1, Number(p.get("perPage")) || 200));

  // ⚠️ CURSORE COMPOSITO (revisione, id) — giuria performance 28/08.
  // `revisione` è un contatore PER RIGA (@default(1)), non una sequenza
  // globale: con più di perPagina task alla stessa revisione, il vecchio
  // cursore `gt: revisione` SALTAVA le rimanenti per sempre. L'id fa da
  // spareggio: dentro la stessa revisione si riprende da dove si era.
  const ripresa: Prisma.TaskWhereInput = {
    OR: [{ revisione: { gt: since } }, { revisione: since, id: { gt: sinceId } }],
  };
  const where: Prisma.TaskWhereInput = { AND: [ripresa] };
  const sistema = p.get("sistema")?.trim();
  if (sistema) where.sistema = sistema;
  const utente = p.get("utente")?.trim();
  if (utente) where.utenteEmail = utente.toLowerCase();

  const dati = await prisma.task.findMany({
    where,
    include: { livelli: true },
    orderBy: [{ revisione: "asc" }, { id: "asc" }],
    take: perPagina,
  });

  // Nuovo cursore = (revisione, id) dell'ultima riga restituita.
  const ultima = dati.length ? dati[dati.length - 1] : null;
  const cursore = ultima ? ultima.revisione : since;
  const cursoreId = ultima ? ultima.id : sinceId;
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
    // Lo spareggio del cursore: il chiamante lo rimanda come `sinceId` insieme
    // a `since` per riprendere DENTRO una revisione affollata.
    cursoreId,
    altre,
    conteggio: dati.length,
    dati: dati.map(serializzaTask),
  });
}

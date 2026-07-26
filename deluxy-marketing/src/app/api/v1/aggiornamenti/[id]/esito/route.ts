import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { registra } from "@/lib/registro";

// POST /api/v1/aggiornamenti/:id/esito — lo script dice che l'ha fatta.
// Body: { riuscita?: bool, dettaglio?: string }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;
  const { id } = await ctx.params;

  let body: { riuscita?: boolean; dettaglio?: string } = {};
  try {
    body = await req.json();
  } catch {
    // corpo vuoto: si assume riuscita
  }

  const richiesta = await prisma.richiestaAggiornamento.findUnique({ where: { id } });
  if (!richiesta) return erroreApi(404, "Richiesta non trovata");
  if (richiesta.stato === "fatta") {
    return NextResponse.json({ richiesta, nota: "già chiusa" });
  }

  const riuscita = body.riuscita !== false;
  const aggiornata = await prisma.richiestaAggiornamento.update({
    where: { id },
    data: {
      stato: riuscita ? "fatta" : "scaduta",
      fattaIl: new Date(),
      esito: body.dettaglio ?? (riuscita ? "eseguita" : "fallita"),
    },
  });

  await registra({
    autore: cliente.nome,
    tipo: "sync",
    entita: "metrica",
    entitaId: id,
    titolo: `Aggiornamento ${riuscita ? "eseguito" : "FALLITO"}: ${richiesta.lavoro} · ultimi ${richiesta.giorni} giorni`,
    dettaglio: body.dettaglio ?? null,
  });

  return NextResponse.json({ richiesta: aggiornata });
}

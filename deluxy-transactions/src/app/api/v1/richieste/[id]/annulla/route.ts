import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { autentica, erroreApi, ipChiamante, rispostaApi } from "@/lib/api-auth";
import { annulla } from "@/lib/richieste";

// POST /api/v1/richieste/<id o riferimento>/annulla
// L'app di origine ritira la richiesta (ordine cancellato, importo sbagliato).
// Funziona solo finché nessuno l'ha approvata: dopo, la decisione è di chi
// autorizza, non di chi ha chiesto.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autentica(req, { scrittura: true });
  if (!auth.ok) return auth.risposta;
  const { id } = await ctx.params;

  const r = await prisma.richiesta.findFirst({
    where: { chiaveApiId: auth.cliente.id, OR: [{ id }, { riferimento: id }] },
    select: { id: true },
  });
  if (!r) return erroreApi(404, "Richiesta non trovata per questa chiave.");

  let motivo = "";
  try {
    motivo = String((JSON.parse(auth.corpo || "{}") as { motivo?: unknown }).motivo ?? "");
  } catch {
    // corpo facoltativo
  }

  const esito = await annulla(r.id, auth.cliente.nome, motivo, ipChiamante(req));
  if (!esito.ok) return erroreApi(409, esito.errore);
  return rispostaApi({ stato: esito.stato, messaggio: esito.messaggio });
}

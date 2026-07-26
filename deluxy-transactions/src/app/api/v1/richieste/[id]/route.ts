import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { autentica, erroreApi, rispostaApi } from "@/lib/api-auth";
import { ibanMascherato } from "@/lib/iban";

// GET /api/v1/richieste/<id o riferimento> — stato di una richiesta.
// Si accetta anche il riferimento (TRX-2026-000123) perché è quello che l'app
// di origine mostra ai suoi utenti.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autentica(req);
  if (!auth.ok) return auth.risposta;
  const { id } = await ctx.params;

  const r = await prisma.richiesta.findFirst({
    where: { chiaveApiId: auth.cliente.id, OR: [{ id }, { riferimento: id }] },
    include: { approvazioni: { select: { esito: true, creataIl: true } } },
  });
  if (!r) return erroreApi(404, "Richiesta non trovata per questa chiave.");

  return rispostaApi({
    id: r.id,
    riferimento: r.riferimento,
    riferimentoEsterno: r.riferimentoEsterno,
    stato: r.stato,
    importoCent: r.importoCent,
    valuta: r.valuta,
    beneficiario: r.beneficiario,
    iban: ibanMascherato(r.iban),
    causale: r.causale,
    rischio: r.rischio,
    doppiaFirma: r.doppiaFirma,
    // Quante firme sono state raccolte, non chi le ha messe: i nomi degli
    // operatori restano dentro Transactions.
    firmeRaccolte: r.approvazioni.filter((a) => a.esito === "approvata").length,
    firmeNecessarie: r.doppiaFirma ? 2 : 1,
    creataIl: r.creataIl.toISOString(),
    decisaIl: r.decisaIl?.toISOString() ?? null,
    pagataIl: r.pagataIl?.toISOString() ?? null,
  });
}

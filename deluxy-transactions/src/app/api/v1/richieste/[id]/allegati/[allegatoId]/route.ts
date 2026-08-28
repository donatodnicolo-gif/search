import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { autentica, erroreApi } from "@/lib/api-auth";
import { intestazioniDownload } from "@/lib/allegati";

// GET /api/v1/richieste/<id|riferimento>/allegati/<allegatoId> — i byte.
//
// Solo l'app che ha creato la richiesta, solo con firma valida. Le difese in
// uscita sono quelle del canone (Libro Sicurezza cap. 10): Content-Type dalla
// whitelist, attachment mai inline, nosniff, no-store. Lo sha256 del file
// viaggia nell'intestazione: chi scarica può verificare che i byte siano
// quelli annunciati dal webhook.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; allegatoId: string }> }) {
  const auth = await autentica(req);
  if (!auth.ok) return auth.risposta;
  const { id, allegatoId } = await ctx.params;

  const allegato = await prisma.allegato.findFirst({
    where: {
      id: allegatoId,
      richiesta: { chiaveApiId: auth.cliente.id, OR: [{ id }, { riferimento: id }] },
    },
    include: { dati: true },
  });
  if (!allegato?.dati) return erroreApi(404, "Allegato non trovato per questa chiave.");

  const buffer = Buffer.from(allegato.dati.dati, "base64");
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      ...intestazioniDownload(allegato),
      "Content-Length": String(buffer.length),
      "x-allegato-sha256": allegato.sha256,
      "x-allegato-ruolo": allegato.ruolo,
    },
  });
}

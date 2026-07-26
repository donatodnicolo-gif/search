import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { confrontaSicuro } from "@/lib/crypto";

// Pulizia notturna: si buttano solo dati tecnici scaduti (nonce, contatori,
// chiavi di idempotenza vecchie, sessioni scadute). Richieste, approvazioni ed
// eventi non si cancellano mai — nemmeno qui, nemmeno "per fare spazio".

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const atteso = (process.env.CRON_SECRET ?? "").trim();
  const arrivato = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!atteso || !confrontaSicuro(atteso, arrivato)) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }

  const adesso = new Date();
  const trentaGiorniFa = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [nonce, contatori, idempotenza, sessioni] = await Promise.all([
    prisma.nonce.deleteMany({ where: { scadeIl: { lt: adesso } } }),
    prisma.contatore.deleteMany({ where: { scadeIl: { lt: adesso } } }),
    prisma.idempotenza.deleteMany({ where: { creataIl: { lt: trentaGiorniFa } } }),
    prisma.sessione.deleteMany({ where: { scadeIl: { lt: trentaGiorniFa } } }),
  ]);

  return NextResponse.json(
    {
      ok: true,
      rimossi: {
        nonce: nonce.count,
        contatori: contatori.count,
        idempotenza: idempotenza.count,
        sessioni: sessioni.count,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

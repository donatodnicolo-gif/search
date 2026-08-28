import { NextRequest, NextResponse } from "next/server";
import { scaricaAllegatoTransactions } from "@/lib/transactions";

// GET /api/prova-pagamento/<rif TRX>/<allegatoId> — scarica la PROVA di un
// pagamento da Transactions e la passa all'operatore. La prova VIVE di là
// (una casa sola): qui c'è solo il proxy, dietro la sessione, verso il base
// URL configurato — mai verso un indirizzo arrivato da fuori.

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ rif: string; allegatoId: string }> }) {
  const { rif, allegatoId } = await ctx.params;
  if (!/^TRX-\d{4}-\d{6}$/.test(rif)) return NextResponse.json({ errore: "Riferimento non valido." }, { status: 400 });

  const esito = await scaricaAllegatoTransactions(rif, allegatoId);
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 });
  return new Response(new Uint8Array(esito.dati), {
    status: 200,
    headers: {
      "Content-Type": esito.tipo,
      "Content-Disposition": `attachment; filename="${esito.nome.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

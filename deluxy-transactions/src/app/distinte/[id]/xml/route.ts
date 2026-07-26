import { NextResponse } from "next/server";
import { esportaLotto } from "@/app/actions";

// Scarica il file SEPA della distinta. Passa dall'azione, così il download
// resta tracciato nel registro con chi l'ha generato e l'impronta del file.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const esito = await esportaLotto(id);
  if ("errore" in esito) {
    return new NextResponse(esito.errore, {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return new NextResponse(esito.xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="${esito.nome}"`,
      "Cache-Control": "no-store",
    },
  });
}

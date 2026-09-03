import { NextRequest, NextResponse } from "next/server";
import { caricaDocumentoProForma } from "@/lib/proforma-documento";
import { pdfProForma } from "@/lib/proforma-pdf";

// «Scarica PDF» della pro-forma / del preventivo: il documento generato sul
// server (proforma-pdf.tsx), con il nome file parlante.
// Protetta dalla sessione come tutte le pagine (il middleware non la esclude):
// il PDF contiene i dati fiscali del cliente e le nostre coordinate bancarie.
// `?inline=1` lo apre nel browser invece di scaricarlo (anteprima).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = await caricaDocumentoProForma(id);
  if (!d) return NextResponse.json({ errore: "Documento non trovato" }, { status: 404 });
  const pdf = await pdfProForma(d);
  const inline = req.nextUrl.searchParams.get("inline") === "1";
  // RFC 6266: filename ASCII di ripiego + filename* UTF-8 (il nome ha «—» e accenti)
  const ascii = d.nomeFile.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "-");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.nomeFile)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

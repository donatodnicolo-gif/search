import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generaSepaXml, ordinanteSepa } from "@/lib/sepa";

// File SEPA (pain.001) di un singolo pagamento diretto, da caricare in banca/
// Qonto dove viene AUTORIZZATO manualmente. L'app non esegue il bonifico.
// Protetta dal middleware di sessione.
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.pagamentoDiretto.findUnique({ where: { id } });
  if (!p) {
    return new NextResponse("Pagamento non trovato.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const ordinante = await ordinanteSepa();
  if (!ordinante) {
    return new NextResponse(
      "Per generare il file SEPA servono intestazione e IBAN del conto Deluxy: impostali in Impostazioni → Ordinante bonifici SEPA.",
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const xml = generaSepaXml(
    [{ beneficiario: p.beneficiario, iban: p.iban, importo: p.importo, causale: p.causale, bic: p.bic }],
    ordinante,
    { prefissoId: "DELUXY-PAG-DIRETTO" }
  );

  const nomeFile = `sepa-pagamento-${p.beneficiario.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 30)}-${id.slice(0, 6)}.xml`;
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomeFile}"`,
    },
  });
}

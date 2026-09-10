import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessioneApiValida } from "@/lib/sessione-server";

// La foto del cliente, letta dal database. Protetta dalla sessione nel
// middleware (/api/interno/*) e qui dalla revoca: le foto dei clienti sono
// dati personali, non si servono a chi non è dentro.
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ chiave: string }> }) {
  if (!(await sessioneApiValida())) return NextResponse.json({ errore: "Sessione non più valida" }, { status: 401 });
  const { chiave: grezza } = await ctx.params;
  // I route params di Next 15 arrivano ancora percent-encoded (trappola già pagata).
  const chiave = decodeURIComponent(grezza);
  const p = await prisma.profiloCliente.findUnique({
    where: { chiaveCliente: chiave },
    select: { foto: true, fotoTipo: true },
  });
  if (!p?.foto) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(p.foto), {
    headers: {
      "Content-Type": p.fotoTipo || "image/jpeg",
      // Privata e breve: la pagina aggiunge ?v=<aggiornatoIl>, così un cambio
      // di foto si vede subito senza rinunciare alla cache del browser.
      "Cache-Control": "private, max-age=300",
    },
  });
}

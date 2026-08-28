import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

// GET /api/v1/gruppi — i CAPOGRUPPO del registro.
//
// Un capogruppo ha dentro AZIENDE (28/08/2026, modello semplice richiesto
// dall'utente). È l'unico raggruppamento: ha sostituito società/entità/insegna,
// che confondevano. ⚠️ Sola lettura: il capogruppo lo assegna una PERSONA.
//
// ⚠️ Niente importi: il fatturato lo possiede FINANCE. Qui ci sono gli AGGANCI
// (quali aziende compongono il capogruppo) perché chi ha i soldi possa sommarli.
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const take = Math.min(Number(req.nextUrl.searchParams.get("take") ?? 200) || 200, 200);
  const gruppi = await prisma.capogruppo.findMany({
    where: q ? { nome: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { nome: "asc" },
    take,
    include: {
      aziende: {
        where: { attivo: true },
        select: { id: true, nome: true, citta: true, pagaDaSe: true },
        orderBy: { nome: "asc" },
      },
    },
  });

  return NextResponse.json({
    totale: gruppi.length,
    gruppi: gruppi.map((g) => ({
      id: g.id,
      nome: g.nome,
      note: g.note,
      // La capogruppo fattura per le aziende che «pagano la capogruppo».
      pIva: g.pIva,
      aziende: g.aziende.map((a) => ({
        id: a.id,
        nome: a.nome,
        citta: a.citta,
        pagaDaSe: a.pagaDaSe,
      })),
    })),
  });
}

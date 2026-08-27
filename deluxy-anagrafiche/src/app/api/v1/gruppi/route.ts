import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

// GET /api/v1/gruppi — le ENTITÀ commerciali del registro.
//
// L'entità è il cliente come lo intende chi vende, SOPRA le sue società di
// fatturazione: «CHANEL» sono tre società che emettono fatture separate ma
// commercialmente sono un cliente solo. La catena è
// **negozio → società → entità**.
//
// ⚠️ Sola lettura di proposito. Il gruppo lo assegna una PERSONA dal registro:
// non si deduce dal nome (dedurlo unirebbe le cinque «PASTICCERIA …», che sono
// aziende diverse) e non lo scrive nessuna app. Aprirlo in scrittura vorrebbe
// dire ritrovarsi tre entità per lo stesso cliente, scritte da tre app.
//
// ⚠️⚠️ Qui NON ci sono importi, e non ce ne devono essere: il fatturato lo
// possiede FINANCE. Questa rotta dà gli AGGANCI — quali società e quali
// anagrafiche compongono l'entità — perché chi ha i soldi possa sommarli.
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  // ⚠️ Un elenco senza tetto è un'estrazione di massa che aspetta solo di
  // crescere: oggi i gruppi sono pochi, e proprio per questo il tetto si mette
  // adesso, quando non si nota.
  const take = Math.min(Number(req.nextUrl.searchParams.get("take") ?? 200) || 200, 200);
  const gruppi = await prisma.gruppoAziendale.findMany({
    where: q ? { nome: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { nome: "asc" },
    take,
    include: {
      societa: {
        select: { id: true, ragioneSociale: true, pIva: true, _count: { select: { sedi: true } } },
        orderBy: { ragioneSociale: "asc" },
      },
    },
  });

  return NextResponse.json({
    totale: gruppi.length,
    gruppi: gruppi.map((g) => ({
      id: g.id,
      nome: g.nome,
      note: g.note,
      societa: g.societa.map((s) => ({
        id: s.id,
        ragioneSociale: s.ragioneSociale,
        pIva: s.pIva,
        sedi: s._count.sedi,
      })),
    })),
  });
}

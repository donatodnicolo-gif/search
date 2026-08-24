import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

// GET /api/v1/organigramma — l'albero dei riporti delle persone attive.
// Radici = chi non riporta a nessuno; chi ha un responsabile non più attivo
// diventa radice, non sparisce.

export const dynamic = "force-dynamic";

type Nodo = {
  id: string;
  nome: string;
  ruolo: string | null;
  funzione: string | null;
  riporti: Nodo[];
};

export async function GET(req: NextRequest) {
  const esito = await autentica(req);
  if (esito instanceof NextResponse) return esito;

  const persone = await prisma.persona.findMany({
    where: { stato: "attivo" },
    include: { funzione: true },
    orderBy: { nome: "asc" },
  });

  const nodi = new Map<string, Nodo>();
  for (const p of persone) {
    nodi.set(p.id, {
      id: p.id,
      nome: p.nome,
      ruolo: p.ruolo || null,
      funzione: p.funzione?.nome ?? null,
      riporti: [],
    });
  }
  const radici: Nodo[] = [];
  for (const p of persone) {
    const nodo = nodi.get(p.id)!;
    if (p.responsabileId && nodi.has(p.responsabileId)) {
      nodi.get(p.responsabileId)!.riporti.push(nodo);
    } else {
      radici.push(nodo);
    }
  }

  return NextResponse.json(
    { fonte: "deluxy-personale", organigramma: radici, persone: persone.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}

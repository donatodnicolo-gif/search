import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

// GET /api/v1/funzioni — il disegno dell'organizzazione: funzioni → mansioni →
// attività (il mansionario), con chi copre ogni mansione. Sola lettura.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const esito = await autentica(req);
  if (esito instanceof NextResponse) return esito;

  const funzioni = await prisma.funzione.findMany({
    where: { attiva: true },
    include: {
      responsabile: true,
      persone: { where: { stato: "attivo" } },
      mansioni: {
        where: { attiva: true },
        include: {
          attivita: { orderBy: { ordine: "asc" } },
          assegnazioni: { include: { persona: true } },
        },
        orderBy: { nome: "asc" },
      },
    },
    orderBy: [{ ordine: "asc" }, { nome: "asc" }],
  });

  const dati = funzioni.map((f) => ({
    id: f.id,
    nome: f.nome,
    descrizione: f.descrizione || null,
    responsabile: f.responsabile ? { id: f.responsabile.id, nome: f.responsabile.nome } : null,
    persone: f.persone.length,
    mansioni: f.mansioni.map((m) => ({
      id: m.id,
      nome: m.nome,
      descrizione: m.descrizione || null,
      coperta: m.assegnazioni.length > 0,
      assegnatari: m.assegnazioni
        .filter((a) => a.persona.stato === "attivo")
        .map((a) => ({ id: a.persona.id, nome: a.persona.nome, principale: a.principale })),
      attivita: m.attivita.map((a) => ({
        nome: a.nome,
        dettaglio: a.dettaglio || null,
        frequenza: a.frequenza || null,
      })),
    })),
  }));

  return NextResponse.json(
    { fonte: "deluxy-personale", funzioni: dati, totale: dati.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}

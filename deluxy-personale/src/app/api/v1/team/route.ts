import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import {
  compensoCorrente,
  costoAziendaAnnuo,
  eAutonomo,
  inquadramentoCorrente,
  nomeTipoContratto,
  prossimaDecorrenza,
  TIPI_CONTRATTO,
} from "@/lib/organico";

// GET /api/v1/team — squadre (= funzioni) e persone per le altre app Deluxy,
// nello STESSO formato del /api/v1/team di Budgets: il Hub lo legge già da là,
// e un lettore non deve imparare due lingue per lo stesso concetto.
// Differenza dichiarata: qui è l'organico REALE (fonte deluxy-personale),
// in Budgets è il roster di pianificazione per anno di budget.
//
// Parametri:
//   ?compensi=1   aggiunge il costo azienda annuo. FUORI di default: sono
//                 stipendi, chi li vuole li chiede e si vede nei log.
//
// Cosa NON esce mai da qui: il netto in busta (dato dichiarato, personale).

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const esito = await autentica(req);
  if (esito instanceof NextResponse) return esito;

  const conCompensi = req.nextUrl.searchParams.get("compensi") === "1";

  const [funzioni, personeDb] = await Promise.all([
    prisma.funzione.findMany({
      where: { attiva: true },
      include: { responsabile: true },
      orderBy: [{ ordine: "asc" }, { nome: "asc" }],
    }),
    prisma.persona.findMany({
      where: { stato: "attivo" },
      include: { funzione: true, inquadramenti: true, compensi: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  const persone = personeDb.map((p) => {
    const inquadramento = inquadramentoCorrente(p.inquadramenti);
    // Per un autonomo (P.IVA, consulente) il costo è il compenso anche senza
    // la % oneri: su una fattura non ci sono oneri datoriali nascosti.
    const autonomo = eAutonomo((inquadramento ?? prossimaDecorrenza(p.inquadramenti))?.tipoContratto);
    const compenso = conCompensi ? compensoCorrente(p.compensi) : null;
    const costo = conCompensi ? costoAziendaAnnuo(compenso, { autonomo }) : null;
    return {
      id: p.id,
      nome: p.nome,
      email: p.email || null,
      ruolo: p.ruolo,
      tipo: inquadramento?.tipoContratto ?? "",
      tipoNome: inquadramento ? nomeTipoContratto(inquadramento.tipoContratto) : "non indicato",
      teamId: p.funzioneId,
      partTimePct: inquadramento?.partTimePct ?? 100,
      // Il costo può essere null anche con ?compensi=1: senza la % contributi
      // è "non calcolabile", non zero.
      ...(conCompensi ? { costoAzienda: costo } : {}),
    };
  });

  const team = funzioni.map((f) => ({
    id: f.id,
    nome: f.nome,
    responsabile: f.responsabile?.nome ?? null,
    persone: persone.filter((x) => x.teamId === f.id).map(({ teamId: _t, ...resto }) => resto),
  }));

  // Chi non ha funzione non sparisce: un elenco che perde persone per strada è
  // peggio di un elenco con una voce «senza team».
  const senzaTeam = persone.filter((x) => !x.teamId).map(({ teamId: _t, ...resto }) => resto);

  return NextResponse.json(
    {
      fonte: "deluxy-personale",
      compensiInclusi: conCompensi,
      team,
      senzaTeam,
      totali: { team: team.length, persone: persone.length, senzaTeam: senzaTeam.length },
      tipiPersona: TIPI_CONTRATTO.map((t) => ({ chiave: t.chiave, nome: t.nome })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

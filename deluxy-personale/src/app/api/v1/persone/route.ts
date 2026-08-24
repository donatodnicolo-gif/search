import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import {
  compensoCorrente,
  costoAziendaAnnuo,
  inquadramentoCorrente,
  nomeTipoContratto,
} from "@/lib/organico";

// GET /api/v1/persone — la scheda completa di ogni persona per le app Deluxy
// (Hub, Budgets…): anagrafica, funzione, mansioni, riporto, inquadramento
// corrente. Con ?compensi=1 esce anche la retribuzione (RAL, mensilità,
// contributi, costo azienda) — fuori di default perché sono stipendi.
//
// Parametri:
//   ?stato=attivo|cessato|tutti   default: attivo
//   ?compensi=1                   aggiunge la retribuzione corrente
//
// Il netto in busta NON esce mai: è un dato dichiarato, personale.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const esito = await autentica(req);
  if (esito instanceof NextResponse) return esito;

  const p = req.nextUrl.searchParams;
  const stato = p.get("stato") === "cessato" ? "cessato" : p.get("stato") === "tutti" ? null : "attivo";
  const conCompensi = p.get("compensi") === "1";

  const persone = await prisma.persona.findMany({
    where: stato ? { stato } : {},
    include: {
      funzione: true,
      responsabile: true,
      assegnazioni: { include: { mansione: { include: { funzione: true } } } },
      inquadramenti: true,
      compensi: true,
    },
    orderBy: { nome: "asc" },
  });

  const dati = persone.map((x) => {
    const inquadramento = inquadramentoCorrente(x.inquadramenti);
    const compenso = conCompensi ? compensoCorrente(x.compensi) : null;
    return {
      id: x.id,
      nome: x.nome,
      email: x.email || null,
      telefono: x.telefono || null,
      ruolo: x.ruolo,
      sede: x.sede || null,
      stato: x.stato,
      dataAssunzione: x.dataAssunzione?.toISOString().slice(0, 10) ?? null,
      dataCessazione: x.dataCessazione?.toISOString().slice(0, 10) ?? null,
      funzione: x.funzione ? { id: x.funzione.id, nome: x.funzione.nome } : null,
      riportaA: x.responsabile ? { id: x.responsabile.id, nome: x.responsabile.nome } : null,
      mansioni: x.assegnazioni.map((a) => ({
        id: a.mansione.id,
        nome: a.mansione.nome,
        funzione: a.mansione.funzione.nome,
        principale: a.principale,
      })),
      inquadramento: inquadramento
        ? {
            decorrenza: inquadramento.decorrenza.toISOString().slice(0, 10),
            tipoContratto: inquadramento.tipoContratto,
            tipoContrattoNome: nomeTipoContratto(inquadramento.tipoContratto),
            ccnl: inquadramento.ccnl || null,
            livello: inquadramento.livello || null,
            qualifica: inquadramento.qualifica || null,
            partTimePct: inquadramento.partTimePct,
            scadenza: inquadramento.scadenza?.toISOString().slice(0, 10) ?? null,
          }
        : null,
      ...(conCompensi
        ? {
            compenso: compenso
              ? {
                  decorrenza: compenso.decorrenza.toISOString().slice(0, 10),
                  ral: Number(compenso.ral),
                  mensilita: compenso.mensilita,
                  contributiPct: compenso.contributiPct != null ? Number(compenso.contributiPct) : null,
                  // null = non calcolabile (contributi non dichiarati), non zero.
                  costoAzienda: costoAziendaAnnuo(compenso),
                  benefit: compenso.benefit || null,
                }
              : null,
          }
        : {}),
    };
  });

  return NextResponse.json(
    { fonte: "deluxy-personale", compensiInclusi: conCompensi, persone: dati, totale: dati.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}

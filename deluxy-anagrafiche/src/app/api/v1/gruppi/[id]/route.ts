import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { leggiCapogruppoConAziende } from "@/lib/fatturazione";

// GET /api/v1/gruppi/:id — il capogruppo con dentro le sue aziende.
//
// È la risposta a «quanto fattura questo cliente con noi in tutte le sue
// aziende»: qui ci sono le AZIENDE con l'id del registro (`anagraficheIds`), le
// chiavi con cui FINANCE riconosce le proprie schede. ⚠️ Gli importi NON stanno
// qui: li possiede FINANCE, che somma le sue schede.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const { id } = await ctx.params;
  const g = await leggiCapogruppoConAziende(id);
  if (!g) return erroreApi(404, "Capogruppo non trovato");

  return NextResponse.json({
    id: g.id,
    nome: g.nome,
    note: g.note,
    // La fatturazione della capogruppo (per chi la paga tramite lei).
    pIva: g.pIva,
    codiceFiscale: g.codiceFiscale,
    aziende: g.aziende.map((a) => ({
      id: a.id,
      nome: a.nome,
      citta: a.citta,
      sede: a.sede,
      stato: a.stato,
      // true = ha la sua fatturazione; false = paga la capogruppo.
      pagaDaSe: a.pagaDaSe,
    })),
    anagraficheIds: g.aziende.map((a) => a.id),
  });
}

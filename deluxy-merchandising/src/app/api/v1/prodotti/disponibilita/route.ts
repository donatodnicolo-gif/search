import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { applicaCalendario, type ProdottoCalendario } from "@/lib/disponibilita-unici";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/v1/prodotti/disponibilita  (10/09/2026, regola utente)
//
// La piattaforma consegne manda il CALENDARIO dei partner proprietari dei prodotti unici:
// per ogni codice, i prossimi N giorni con aperto/chiuso e l'ora di apertura. Qui si calcola
// il valore effettivo di «giorni minimi» e «ora minima» dalla BASE del prodotto e lo si scrive
// sui metafield del negozio (`prodotto.consegna`, `custom.minimo_orario`) — solo se cambia.
//
// Corpo: { giorni, generatoIl, prodotti: [{ codice, partner, senzaOrari, calendario: [{ data, aperto, dalle }] }] }
// `?anteprima=1`: calcola e risponde senza scrivere niente.
export async function POST(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;
  let body: { prodotti?: ProdottoCalendario[]; giorni?: number; generatoIl?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return erroreApi(400, "Corpo della richiesta non è JSON valido.");
  }
  const prodotti = Array.isArray(body?.prodotti) ? body.prodotti : [];
  if (!prodotti.length) return erroreApi(400, "Serve «prodotti»: una lista di { codice, calendario }.");
  if (prodotti.length > 2000) return erroreApi(400, "Troppi prodotti in un colpo solo: massimo 2000 per richiesta.");
  const anteprima = ["1", "true"].includes((req.nextUrl.searchParams.get("anteprima") ?? "").toLowerCase());
  const esito = await applicaCalendario(prodotti, { applica: !anteprima });
  return NextResponse.json({
    ok: true,
    anteprima,
    giorni: body.giorni ?? null,
    generatoIl: body.generatoIl ?? null,
    riepilogo: esito.riepilogo,
    // Tutti gli esiti tranne gli «invariati», che sono la normalità e farebbero rumore.
    esiti: esito.esiti.filter((e) => e.stato !== "invariato"),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { eseguiSyncOrdini } from "@/lib/sync-ordini";

// POST /api/v1/sync/ordini — gli ordini presi da Deluxy Orders, a richiesta.
//
// Gemella di `GET /api/cron/ordini`: stessa logica, porta diversa. Il cron gira
// ogni notte da solo; questa serve a chi vuole i numeri adesso — dopo aver
// sistemato qualcosa in Orders, o per riprendere una finestra più larga.
//
// Body (tutto opzionale):
//   { da?: "2026-07-01", a?: "2026-07-29", brand?: "gifts", annullati?: true }
//
// Senza `da` si guarda una settimana indietro: un ordine cambia stato dopo
// essere stato creato (rimborso, annullamento) e ripassare la settimana costa
// poco.
//
// ⚠️ Per i caricamenti storici lunghi c'è `npm run import:ordini-orders`:
// questa è una funzione serverless e si ferma da sola quando il tempo sta per
// finire, dicendo a che pagina è arrivata. Meglio fermarsi dichiarandolo che
// essere uccisi a metà e sembrare riusciti.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body: { da?: string; a?: string; brand?: string; annullati?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // corpo vuoto: si usano i valori di default
  }

  const esito = await eseguiSyncOrdini({ ...body, budgetMs: 45_000 }, cliente.nome);
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: esito.codice });

  return NextResponse.json({
    periodo: esito.periodo,
    nuovi: esito.nuovi,
    aggiornati: esito.aggiornati,
    invariati: esito.invariati,
    saltati: esito.saltati,
    righe: esito.righe,
    perBrand: esito.perBrand,
    completo: esito.completo,
    nota: esito.nota,
  });
}

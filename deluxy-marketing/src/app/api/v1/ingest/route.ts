import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { deduciTipoConversione, salvaMetriche } from "@/lib/ingest-metriche";
import { registra } from "@/lib/registro";

// POST /api/v1/ingest — porta d'ingresso unica per le piattaforme pubblicitarie.
// Pensata per chi manda dati senza conoscere gli id interni dell'app: le
// campagne si riconoscono (o si creano) dall'id della piattaforma, e le
// metriche si aggiornano per giorno. Idempotente: rimandare gli stessi giorni
// aggiorna i valori invece di duplicarli.
//
// La usa lo script di Google Ads (scripts/google-ads-script.js) e può usarla
// qualsiasi altra fonte: un foglio, una sessione Claude, un altro sistema.
// Meta invece non spinge: è l'app che va a prenderli (vedi /api/v1/sync/meta),
// ma il salvataggio passa dalla stessa funzione — src/lib/ingest-metriche.ts.
//
// Body: {
//   canale?: "google_ads" | "meta_ads" | "tiktok",   (default google_ads)
//   brand?: "flowers" | "cake" | "gifts" | "cross",  (default: dedotto dal nome)
//   account?: "825-518-1560",
//   righe: [{
//     idCampagna*: "21489...",   nome*: "[Deluxy] Fiori Milano",
//     data*: "2026-07-22",       spesa?, impression?, click?, conversioni?, ricavi?,
//     stato?: "attiva" | "in_pausa", budgetGiornaliero?, strategiaOfferta?,
//     annunciTotali?, annunciInReview?
//   }]
// }
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body;
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Body JSON non valido");
  }
  const righe = Array.isArray(body.righe) ? body.righe : [];
  if (righe.length === 0) return erroreApi(400, "Nessuna riga da importare");

  const canale = body.canale ?? "google_ads";
  const account = body.account ? String(body.account) : null;

  const esito = await salvaMetriche(righe, { canale, account, brand: body.brand });
  await deduciTipoConversione(esito.campagneToccate);

  await prisma.ricezioneDati.create({
    data: {
      fonte: canale,
      account,
      tipo: "metriche",
      chiave: cliente.nome,
      righe: righe.length,
      nuove: esito.campagneCreate,
      aggiornate: esito.metricheSalvate,
      scartate: esito.righeScartate,
      dal: esito.giornoMin,
      al: esito.giornoMax,
      campagne: esito.campagneToccate.size,
      esito: esito.righeScartate > 0 ? "parziale" : "ok",
    },
  });

  await registra({
    autore: cliente.nome,
    tipo: "import",
    entita: "metrica",
    titolo: `Import ${canale}${account ? ` da account ${account}` : ""}`,
    dettaglio: `${esito.metricheSalvate} giorni-campagna · ${esito.campagneCreate} campagne nuove${esito.righeScartate ? ` · ${esito.righeScartate} righe scartate` : ""}`,
  });

  return NextResponse.json(
    {
      metricheSalvate: esito.metricheSalvate,
      campagneCreate: esito.campagneCreate,
      righeScartate: esito.righeScartate,
    },
    { status: 201 }
  );
}

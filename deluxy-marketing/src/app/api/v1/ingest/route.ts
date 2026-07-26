import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { salvaMetricheGruppi } from "@/lib/ingest-gruppi";
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
//   }],
//   gruppi?: [{                          ← gruppi di annunci, stessa forma
//     idGruppo*: "825-518-1560:12345",   idCampagna?: "21489…", campagna?: "…",
//     nome*: "Fiori Milano ITA",         data*: "2026-07-22",
//     spesa?, impression?, click?, conversioni?, ricavi?,
//     statoPiattaforma?: "ENABLED" | "PAUSED", tipo?: "asset_group_pmax"
//   }]
// }
// I gruppi seguono le campagne: la campagna si riconosce da `idCampagna` (o dal
// nome), e se non si riconosce la riga viene scartata invece di appendere il
// gruppo a una campagna sbagliata. Mandare campagne e gruppi nella stessa
// richiesta è lecito e consigliato.
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
  const gruppi = Array.isArray(body.gruppi) ? body.gruppi : [];
  if (righe.length === 0 && gruppi.length === 0) {
    return erroreApi(400, "Nessuna riga da importare: servono 'righe' o 'gruppi'");
  }

  const canale = body.canale ?? "google_ads";
  const account = body.account ? String(body.account) : null;

  const esito = await salvaMetriche(righe, { canale, account, brand: body.brand });
  await deduciTipoConversione(esito.campagneToccate);

  // I gruppi si salvano dopo le campagne: se arrivano insieme, la campagna
  // appena creata è già lì ad accoglierli.
  const esitoGruppi = gruppi.length > 0
    ? await salvaMetricheGruppi(gruppi, { canale })
    : null;

  const scartateInTutto = esito.righeScartate + (esitoGruppi?.righeScartate ?? 0);
  const soloGruppi = righe.length === 0 && gruppi.length > 0;

  await prisma.ricezioneDati.create({
    data: {
      fonte: canale,
      account,
      tipo: soloGruppi ? "gruppi" : "metriche",
      chiave: cliente.nome,
      righe: righe.length + gruppi.length,
      nuove: esito.campagneCreate + (esitoGruppi?.gruppiCreati ?? 0),
      aggiornate: esito.metricheSalvate + (esitoGruppi?.metricheSalvate ?? 0),
      scartate: scartateInTutto,
      dal: esito.giornoMin ?? esitoGruppi?.giornoMin ?? null,
      al: esito.giornoMax ?? esitoGruppi?.giornoMax ?? null,
      campagne: esito.campagneToccate.size,
      esito: scartateInTutto > 0 ? "parziale" : "ok",
    },
  });

  const dettaglioGruppi = esitoGruppi
    ? ` · ${esitoGruppi.metricheSalvate} giorni-gruppo, ${esitoGruppi.gruppiCreati} gruppi nuovi${
        esitoGruppi.campagneNonTrovate.length
          ? ` · gruppi scartati, campagna non riconosciuta: ${esitoGruppi.campagneNonTrovate.slice(0, 3).join(", ")}`
          : ""
      }`
    : "";

  await registra({
    autore: cliente.nome,
    tipo: "import",
    entita: "metrica",
    titolo: `Import ${canale}${account ? ` da account ${account}` : ""}`,
    dettaglio: `${esito.metricheSalvate} giorni-campagna · ${esito.campagneCreate} campagne nuove${esito.righeScartate ? ` · ${esito.righeScartate} righe scartate` : ""}${dettaglioGruppi}`,
  });

  return NextResponse.json(
    {
      metricheSalvate: esito.metricheSalvate,
      campagneCreate: esito.campagneCreate,
      righeScartate: esito.righeScartate,
      ...(esitoGruppi
        ? {
            gruppi: {
              metricheSalvate: esitoGruppi.metricheSalvate,
              gruppiCreati: esitoGruppi.gruppiCreati,
              righeScartate: esitoGruppi.righeScartate,
              campagneNonTrovate: esitoGruppi.campagneNonTrovate,
            },
          }
        : {}),
    },
    { status: 201 }
  );
}

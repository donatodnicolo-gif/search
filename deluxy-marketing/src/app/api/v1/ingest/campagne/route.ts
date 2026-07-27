import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { salvaAnagrafica, type RigaAnagrafica } from "@/lib/ingest-metriche";
import { registra } from "@/lib/registro";

// POST /api/v1/ingest/campagne — l'ANAGRAFICA delle campagne, senza metriche.
//
// Le metriche arrivano da una query per giorno: una campagna in pausa da
// settimane non produce righe e per l'app non esiste. Questa rotta riceve
// l'elenco di quelle che ESISTONO davvero sull'account, spesa o non spesa, così
// una campagna ferma si può vedere e decidere di riattivarla.
//
// Body: { account?, brand?, campagne: [{ idCampagna, nome, stato, budgetGiornaliero, strategiaOfferta, tipo }] }
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body: { account?: string; brand?: string; canale?: string; campagne?: RigaAnagrafica[] };
  try {
    body = await req.json();
  } catch {
    return erroreApi(400, "Corpo non leggibile: serve un JSON con la lista campagne");
  }

  const campagne = Array.isArray(body.campagne) ? body.campagne : [];
  if (campagne.length === 0) {
    return erroreApi(400, "Nessuna campagna nel corpo: atteso { campagne: [...] }");
  }

  const canale = body.canale ?? "google_ads";
  const esito = await salvaAnagrafica(campagne, {
    canale,
    account: body.account ?? null,
    brand: body.brand,
  });

  await prisma.ricezioneDati.create({
    data: {
      fonte: canale,
      account: body.account ?? null,
      tipo: "anagrafica",
      chiave: cliente.nome,
      righe: campagne.length,
      nuove: esito.create,
      aggiornate: esito.aggiornate,
      scartate: esito.scartate,
      campagne: campagne.length,
      esito: "ok",
    },
  });

  // Si annota solo quando c'è una novità: un giro che non cambia niente è la
  // normalità e non merita una riga nello storico.
  if (esito.create > 0 || esito.aggiornate > 0) {
    await registra({
      autore: cliente.nome,
      tipo: "import",
      entita: "campagna",
      titolo: `Anagrafica ${canale}: ${esito.create} campagne nuove, ${esito.aggiornate} aggiornate`,
      dettaglio: `${campagne.length} campagne lette dall'account${body.account ? ` ${body.account}` : ""} · ${esito.invariate} invariate`,
    });
  }

  return NextResponse.json({ ...esito, lette: campagne.length }, { status: 201 });
}

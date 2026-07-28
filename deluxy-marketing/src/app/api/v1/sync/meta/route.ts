import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { eseguiSyncMeta } from "@/lib/sync-meta";

// POST /api/v1/sync/meta — va a PRENDERE i dati da Meta (il contrario di
// /api/v1/ingest, dove Google li spinge). Meta non ha gli Scripts: serve che
// l'app chiami la Graph API con un token di utente di sistema.
//
// Body (tutto opzionale):
//   { account?: "2802316249885506", giorni?: 7, dal?: "2026-01-01", al?: "2026-07-26" }
// Senza "account" gira su tutti gli account Meta attivi censiti in /impostazioni.
//
// Il lavoro vero sta in `lib/sync-meta.ts`, perché lo fa anche il cron orario
// (`GET /api/cron/meta`): finché esisteva solo questa porta, i dati Meta si
// aggiornavano soltanto quando qualcuno premeva un bottone.
export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body: { account?: string; giorni?: number; dal?: string; al?: string } = {};
  try {
    body = await req.json();
  } catch {
    // corpo vuoto: si usano i valori di default
  }

  const esito = await eseguiSyncMeta(body, cliente.nome);
  if (!esito.ok) return erroreApi(esito.codice, esito.errore);

  return NextResponse.json(
    {
      periodo: esito.periodo,
      totaleMetriche: esito.totaleMetriche,
      account: esito.account,
      nota: esito.nota,
    },
    { status: esito.tuttiInErrore ? 502 : 201 }
  );
}

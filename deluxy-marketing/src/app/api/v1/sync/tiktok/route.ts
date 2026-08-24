import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { eseguiSyncTikTok } from "@/lib/sync-tiktok";

// POST /api/v1/sync/tiktok — come il gemello di Meta: è l'app che va a
// prendere i dati, perché TikTok non ha script che girano dentro l'account.
//
// Body (tutto opzionale):
//   { account?: "7123456789012345678", giorni?: 7, dal?: "2026-01-01", al?: "2026-07-27" }
// Senza "account" gira su tutti gli advertiser TikTok attivi in /impostazioni.
//
// ⚠️ Il motore sta in `lib/sync-tiktok.ts`, non qui: lo stesso giro deve poter
// partire **da solo** dal cron (`/api/cron/tiktok`), che non ha una chiave di
// scrittura. Finché è vissuto dentro questa rotta, TikTok poteva essere
// collegato benissimo e non arrivare mai niente.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const cliente = await autentica(req, { scrittura: true });
  if (cliente instanceof NextResponse) return cliente;

  let body: { account?: string; giorni?: number; dal?: string; al?: string } = {};
  try {
    body = await req.json();
  } catch {
    // corpo vuoto: valori di default
  }

  const esito = await eseguiSyncTikTok(body, cliente.nome);
  if (!esito.ok) return erroreApi(esito.codice, esito.errore);

  return NextResponse.json(
    {
      periodo: esito.periodo,
      totaleMetriche: esito.totaleMetriche,
      account: esito.account,
      note: esito.note,
    },
    { status: esito.tuttiInErrore ? 502 : 201 },
  );
}

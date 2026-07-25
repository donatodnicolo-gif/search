import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { eseguiSyncOrdini } from "@/lib/sync";

// POST /api/v1/sync?giorni=90 — avvia lo scarico degli ordini da Shopify
// (richiede chiave di scrittura). Utile per un cron esterno o un pulsante di
// un'altra app. Torna il conteggio di nuovi/aggiornati ed eventuali errori.
//
// `giorni=tutto` (o 0) importa TUTTO lo storico: attenzione, su negozi grandi
// dura decine di minuti e può superare il tempo massimo di una richiesta —
// per il primo import conviene lo script `npm run import:storico`.
export async function POST(req: NextRequest) {
  const client = await autentica(req, { scrittura: true });
  if (client instanceof NextResponse) return client;
  const param = (req.nextUrl.searchParams.get("giorni") ?? "90").trim().toLowerCase();
  const giorni = param === "tutto" || param === "0" ? null : Number(param) || 90;
  const esito = await eseguiSyncOrdini(giorni);
  return NextResponse.json(esito);
}

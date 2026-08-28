import { NextRequest, NextResponse } from "next/server";
import { estraiPagamentoTransactions } from "@/lib/transactions";

// POST /api/estrai-pagamento — lettura AI di una richiesta di pagamento
// (testo incollato o screenshot) per il modulo di /richiedi-pagamento.
// È un proxy verso il motore CENTRALE di Transactions (POST /api/v1/estrai):
// un motore solo, un prompt solo, per tutto l'ecosistema. L'esito riempie i
// campi che la persona rilegge — non salva mai niente da solo.
// Dietro la sessione (middleware): non è un servizio pubblico.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let corpo: { testo?: unknown; immagine?: { dati?: unknown; tipo?: unknown } };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ errore: "Corpo non valido." }, { status: 400 });
  }
  const testo = typeof corpo.testo === "string" ? corpo.testo.slice(0, 20_000) : undefined;
  const immagine = corpo.immagine?.dati
    ? { dati: String(corpo.immagine.dati).replace(/^data:[^;]+;base64,/, ""), tipo: String(corpo.immagine.tipo ?? "image/png") }
    : undefined;
  if (!testo && !immagine) return NextResponse.json({ errore: "Incolla un testo o un'immagine." }, { status: 400 });

  const esito = await estraiPagamentoTransactions({ testo, immagine });
  if (!esito.ok) return NextResponse.json({ errore: esito.errore }, { status: 502 });
  return NextResponse.json(esito.esito, { headers: { "Cache-Control": "no-store" } });
}

import { NextRequest, NextResponse } from "next/server";
import { operatoreCorrente } from "@/lib/sessione";
import { estraiPagamento, estrazioneConfigurata, type Immagine } from "@/lib/ai-estrai";
import { TETTO_ALLEGATO } from "@/lib/allegati";

// POST /api/estrai — la stessa lettura AI, per la UI di quest'app (sessione
// operatore). Riempie il modulo della richiesta manuale: l'operatore rilegge
// e salva, l'esito non scrive mai da solo.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const operatore = await operatoreCorrente();
  if (!operatore) return NextResponse.json({ errore: "Serve l'accesso." }, { status: 401 });
  if (operatore.ruolo === "osservatore") {
    return NextResponse.json({ errore: "Il ruolo osservatore non crea richieste." }, { status: 403 });
  }
  if (!estrazioneConfigurata()) {
    return NextResponse.json(
      { errore: "Lettura AI non configurata: servono OPENAI_API_KEY o ANTHROPIC_API_KEY nell'ambiente." },
      { status: 503 },
    );
  }

  let corpo: { testo?: unknown; immagine?: { dati?: unknown; tipo?: unknown } };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ errore: "Corpo JSON non valido." }, { status: 400 });
  }

  const testo = typeof corpo.testo === "string" ? corpo.testo.slice(0, 20_000) : undefined;
  let immagine: Immagine | undefined;
  if (corpo.immagine?.dati) {
    const dati = String(corpo.immagine.dati).replace(/^data:[^;]+;base64,/, "");
    const tipo = String(corpo.immagine.tipo ?? "image/png");
    if (dati.length > Math.ceil((TETTO_ALLEGATO * 4) / 3) + 8) {
      return NextResponse.json({ errore: `Immagine troppo grande (max ${Math.round(TETTO_ALLEGATO / 1000)} KB).` }, { status: 413 });
    }
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(tipo)) {
      return NextResponse.json({ errore: "Tipo immagine non supportato." }, { status: 415 });
    }
    immagine = { dati, tipo };
  }
  if (!testo && !immagine) return NextResponse.json({ errore: "Incolla un testo o un'immagine." }, { status: 400 });

  const esito = await estraiPagamento({ testo, immagine });
  if (esito.stato === "non-configurato") {
    return NextResponse.json({ errore: "Lettura AI non configurata." }, { status: 503 });
  }
  if (esito.stato === "errore") return NextResponse.json({ errore: esito.messaggio }, { status: 502 });
  return NextResponse.json(esito, { headers: { "Cache-Control": "no-store" } });
}

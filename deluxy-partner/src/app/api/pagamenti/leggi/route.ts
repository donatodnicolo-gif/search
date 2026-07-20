import { NextRequest, NextResponse } from "next/server";
import { leggiBonificoDaImmagine } from "@/lib/lettura-iban";
import { ibanValido } from "@/lib/impostazioni";

// Legge i dati di un bonifico da un'immagine caricata. Protetta dal middleware
// di sessione (non è una API pubblica). Nessun pagamento viene disposto: torna
// solo i dati estratti, che l'operatore verifica prima di predisporre il SEPA.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Lettura AI non configurata: manca OPENAI_API_KEY su Vercel." },
      { status: 503 }
    );
  }

  let file: File | null = null;
  try {
    const fd = await req.formData();
    const f = fd.get("immagine");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "Nessuna immagine caricata." }, { status: 400 });
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Il file deve essere un'immagine (foto o screenshot)." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Immagine troppo grande (max 8 MB)." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buf.toString("base64")}`;

  try {
    const dati = await leggiBonificoDaImmagine(dataUrl);
    return NextResponse.json({
      dati,
      ibanValido: dati.iban ? ibanValido(dati.iban) : false,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

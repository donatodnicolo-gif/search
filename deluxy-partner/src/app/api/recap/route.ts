import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { riepilogoPartner, ANNO_CORRENTE } from "@/lib/queries";
import { costruisciRecapPrompt } from "@/lib/recap";

// Genera il recap AI chiamando l'API OpenAI. Il prompt viene ricostruito qui
// dai dati reali del partner (non si accetta testo arbitrario dal client) e la
// chiave OpenAI resta lato server. Protetto dal middleware come le altre rotte.
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Recap AI non configurato: manca la chiave OpenAI (OPENAI_API_KEY su Vercel)." },
      { status: 503 }
    );
  }

  let partnerId: string;
  try {
    const body = await req.json();
    partnerId = String(body.partnerId ?? "");
  } catch {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  if (!partnerId) return NextResponse.json({ error: "Partner mancante." }, { status: 400 });

  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) return NextResponse.json({ error: "Partner non trovato." }, { status: 404 });

  const anno = ANNO_CORRENTE;
  const annoPrec = anno - 1;
  const [cur, prec] = await Promise.all([
    riepilogoPartner(partnerId, anno),
    riepilogoPartner(partnerId, annoPrec),
  ]);

  const prompt = costruisciRecapPrompt({
    partner,
    anno,
    annoPrec,
    mesi: cur.mesi,
    mesiPrec: prec.mesi,
    rolling: cur.rolling,
    rollingPrec: prec.rolling,
  });

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "Sei un consulente esperto di FINANCE e controllo di gestione. Rispondi in italiano, " +
              "con tono da report direzionale, numeri puntuali e struttura chiara (usa titoletti e " +
              "elenchi puntati). Niente premesse, vai al sodo.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json(
        { error: `Errore OpenAI (${res.status}). ${txt.slice(0, 300)}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    const testo = data?.choices?.[0]?.message?.content?.trim();
    if (!testo) return NextResponse.json({ error: "Risposta AI vuota." }, { status: 502 });

    return NextResponse.json({ recap: testo, model });
  } catch (e) {
    return NextResponse.json(
      { error: `Impossibile contattare OpenAI: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}

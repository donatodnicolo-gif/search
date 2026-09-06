import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";

// POST /api/v1/persone — dal 24/08 al 06/09/2026 un'altra app (Personale)
// PROPONEVA qui una persona al roster dell'anno, come seme di pianificazione.
// Dal 06/09/2026 il roster NON ESISTE PIÙ in Budgets: persone e squadre si
// leggono da Personale (`src/lib/personale.ts`), quindi una persona creata
// là compare qui da sola, al giro dopo, con contratto e compenso veri.
//
// La rotta resta in piedi perché Personale la chiama ancora dopo ogni nuova
// persona (`lib/budgets.ts`, mai bloccante): risponde «non serve più» con un
// 200, così di là nessun avviso rosso — e il giorno in cui si toglie la
// chiamata, questa rotta si può cancellare. Niente scrittura, niente 410:
// un 410 farebbe comparire un errore su una scheda appena creata per una
// cosa che è andata bene.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const negata = await autentica(req);
  if (negata) return negata;

  let nome = "";
  try {
    const corpo = (await req.json()) as { nome?: string };
    nome = (corpo.nome ?? "").trim();
  } catch {
    // corpo assente: la risposta è la stessa
  }
  return NextResponse.json(
    {
      creata: false,
      motivo: "non_serve_piu",
      nota: `Budgets legge l'organico da Personale dal 06/09/2026: ${nome ? `«${nome}» ` : "la persona "}compare da sola nel roster, con contratto e compenso.`,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

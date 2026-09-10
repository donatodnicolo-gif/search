import { NextRequest, NextResponse } from "next/server";
import { ficDocumentoDaNumero } from "@/lib/fic";
import { descriviStatoSdi } from "@/lib/fic-sdi";

// IL DOCUMENTO DI FIC PER LA FINESTRA DELLA FATTURA (08/09/2026).
//
//   GET /api/fic/documento?numero=141/2026&anno=2026
//
// Rotta INTERNA: sta dietro la sessione (non è nelle esclusioni del
// middleware), non ha chiave API e non va data alle altre app — restituisce
// l'URL FIRMATO del PDF, che apre il documento senza password.
//
// Perché una rotta e non un dato calcolato dal server nella pagina: la scheda
// partner mostra decine di fatture su dodici mesi. Risolvere il documento di
// ognuna all'apertura della pagina vorrebbe dire decine di chiamate a FIC per
// una cosa che quasi sempre non viene aperta — e metterebbe tutti gli URL
// firmati nell'HTML. Qui si paga una chiamata sola, quando una persona apre
// quella finestra.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const numero = (req.nextUrl.searchParams.get("numero") ?? "").trim();
  const annoTxt = req.nextUrl.searchParams.get("anno");
  const anno = annoTxt && /^\d{4}$/.test(annoTxt) ? parseInt(annoTxt) : undefined;
  if (!numero) {
    return NextResponse.json({ errore: "Parametro 'numero' obbligatorio." }, { status: 400 });
  }
  try {
    const doc = await ficDocumentoDaNumero(numero, anno);
    if (!doc) {
      // ⚠️ Le due assenze si dicono diverse, come per l'IBAN dal registro:
      // «non c'è» e «non riesco a leggerlo» portano a due azioni diverse.
      return NextResponse.json(
        { errore: `Su Fatture in Cloud non risulta un solo documento con il numero ${numero}.` },
        { status: 404 }
      );
    }
    // 10/09/2026: con il documento arriva anche lo stato dell'invio allo SDI,
    // già tradotto — è la cosa che la finestra deve dire per prima.
    return NextResponse.json({ ok: true, ...doc, sdi: descriviStatoSdi(doc.eiStatus) });
  } catch (e) {
    return NextResponse.json(
      { errore: e instanceof Error ? e.message : "Fatture in Cloud non risponde." },
      { status: 502 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { QUOTA_FORNITORE_DEFAULT, quotaFornitore, valutaQuota } from "@/lib/controllo";

// GET /api/v1/quota-fornitore — quanto ci aspettiamo di pagare al fornitore.
//
// ⚠️⚠️ QUESTA È L'UNICA VERITÀ SULLA QUOTA, e sta qui perché qui si controllano
// i pagamenti ai fornitori: la percentuale si cambia in Impostazioni di Orders
// (`controllo.quotaFornitore`) e da quel momento vale per tutti. Le altre app
// devono CHIEDERLA, non ricopiarsela: una seconda copia scritta nel codice di
// un'altra app resterebbe al vecchio valore il giorno che questo cambia, e le
// due schermate direbbero due numeri diversi senza che nessuno se ne accorga.
//
// La usa Deluxy Customer Service, che sulla scheda di un ordine mostra
// «al fornitore ≈ X €» prima di scrivergli.
//
// Parametro facoltativo `totale`: se c'è, la risposta porta anche l'importo
// atteso per quell'ordine — il conto lo fa chi possiede la regola, così non si
// sparpagliano moltiplicazioni per le app.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (cliente instanceof NextResponse) return cliente;

  const quota = await quotaFornitore();
  const grezzo = req.nextUrl.searchParams.get("totale");
  const totale = grezzo === null ? null : Number(grezzo);

  // ⚠️ Un `totale` illeggibile non diventa zero: senza numero non si risponde
  // con un importo. Un «al fornitore ≈ 0,00 €» sarebbe una risposta sbagliata
  // con l'aria di una giusta.
  const valido = totale !== null && Number.isFinite(totale) && totale > 0;

  return NextResponse.json({
    quota,
    predefinita: QUOTA_FORNITORE_DEFAULT,
    chiave: "controllo.quotaFornitore",
    dove: "Deluxy Orders → Impostazioni",
    // Che cosa vuol dire: pagare SOTTO la quota è bene (margine alto), sopra è
    // male. Scritto qui perché chi mostra il numero lo dica giusto.
    nota: "Quota indicativa uguale per tutti i fornitori: non ci sono regole per fornitore, marchio o prodotto.",
    ...(valido ? { totale, atteso: valutaQuota(totale, 0, quota).atteso } : {}),
  });
}

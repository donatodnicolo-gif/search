import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { eseguiOperazioniMeta, metaPuoScrivere } from "@/lib/meta-scrittura";

// L'esecuzione delle operazioni Meta già approvate.
//
// ⚠️ **Non c'è un cron, ed è voluto.** Su Google il motore è lo script che
// gira dentro l'account: se sbaglia, sbaglia dentro Google. Qui la scrittura
// parte dall'app, e finché non avrà fatto qualche giro vero sotto gli occhi di
// qualcuno non deve poter partire da sola nel cuore della notte. Il cron si
// aggiunge dopo, quando il permesso c'è e le prime operazioni sono andate.
//
// GET  → dice soltanto SE si potrebbe scrivere, e perché no. Non tocca niente.
// POST → esegue le approvate, al massimo 10 per volta.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const cliente = await autentica(req);
  if (!cliente) return erroreApi(401, "Chiave API mancante o non valida");
  const stato = await metaPuoScrivere();
  return NextResponse.json({
    puoScrivere: stato.puo,
    perche: stato.perche,
    nota: "Questa è una diagnosi: non esegue niente. Per eseguire, POST sullo stesso indirizzo.",
  });
}

export async function POST(req: NextRequest) {
  const cliente = await autentica(req);
  if (!cliente) return erroreApi(401, "Chiave API mancante o non valida");
  const esito = await eseguiOperazioniMeta({ limite: 10 });
  return NextResponse.json({
    ...esito,
    // Se è spento non è un errore: è lo stato previsto finché manca il
    // permesso. Un 500 qui farebbe pensare a un guasto.
    messaggio: esito.spento
      ? "Scrittura su Meta non attiva: nessuna operazione è stata toccata."
      : `Eseguite ${esito.eseguite}, fallite ${esito.fallite}, saltate ${esito.saltate}.`,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verificaFattura } from "@/lib/verifica-fattura";
import { chiaveApiValida, appOrigine, ipRichiesta } from "@/lib/apiauth";

// API pubblica: stato di pagamento di una fattura servizi.
//
//   GET /api/fatture?numero=181/2026      (oppure ?id=<idFattura>)
//   Header:  X-API-Key: <chiave>          (la stessa di /api/verifiche)
//   Header:  X-App: <nome-app>            (facoltativo, per lo storico)
//
// Ogni richiesta viene registrata nello storico (stessa tabella di /api/verifiche).

export async function GET(req: NextRequest) {
  const numero = (req.nextUrl.searchParams.get("numero") ?? req.nextUrl.searchParams.get("q") ?? "").trim();
  const id = req.nextUrl.searchParams.get("id")?.trim() || undefined;
  const app = appOrigine(req);
  const indirizzo = ipRichiesta(req);
  const query = numero || (id ? `id:${id}` : "(vuota)");

  if (!(await chiaveApiValida(req))) {
    await prisma.richiestaVerifica.create({
      data: { origine: app, queryPartner: `fattura ${query}`, esito: "non_autorizzato", ip: indirizzo },
    });
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }

  if (!numero && !id) {
    return NextResponse.json({ errore: "Parametro 'numero' (o 'id') obbligatorio." }, { status: 400 });
  }

  const esito = await verificaFattura({ numero: numero || undefined, id });

  await prisma.richiestaVerifica.create({
    data: {
      origine: app,
      queryPartner: `fattura ${query}`,
      partnerId: esito.trovata ? esito.partner.id : null,
      partnerNome: esito.trovata ? esito.partner.nome : null,
      esito: esito.trovata ? "trovato" : "non_trovato",
      rispostaSintesi: esito.trovata
        ? esito.pagata
          ? `Fatt. ${esito.numero ?? esito.id} PAGATA${esito.dataPagamento ? ` il ${esito.dataPagamento}` : ""}`
          : `Fatt. ${esito.numero ?? esito.id} NON pagata${esito.scaduta ? " (scaduta)" : ""}`
        : esito.motivo,
      ip: indirizzo,
    },
  });

  return NextResponse.json(esito, { status: esito.trovata ? 200 : 404 });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verificaPartner } from "@/lib/verifica";

// API pubblica di verifica partner per gli altri progetti Deluxy.
//
//   GET /api/verifiche?partner=<nome o id>
//   Header:  X-API-Key: <chiave>   (oppure Authorization: Bearer <chiave>)
//   Header:  X-App: <nome-app>     (facoltativo, per lo storico)
//
// Risponde con la situazione finanziaria sintetica del partner. Ogni richiesta
// (autorizzata o no) viene registrata nello storico (RichiestaVerifica).

async function chiaveValida(req: NextRequest): Promise<boolean> {
  const attesa = (await prisma.impostazione.findUnique({ where: { chiave: "api.verificheKey" } }))?.valore;
  if (!attesa) return false;
  const header = req.headers.get("x-api-key");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === attesa || bearer === attesa;
}

function origine(req: NextRequest): string | null {
  return req.headers.get("x-app") || req.nextUrl.searchParams.get("origine") || null;
}

function ip(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export async function GET(req: NextRequest) {
  const query = (req.nextUrl.searchParams.get("partner") ?? req.nextUrl.searchParams.get("q") ?? "").trim();
  const app = origine(req);
  const indirizzo = ip(req);

  if (!(await chiaveValida(req))) {
    await prisma.richiestaVerifica.create({
      data: { origine: app, queryPartner: query || "(vuota)", esito: "non_autorizzato", ip: indirizzo },
    });
    return NextResponse.json(
      { errore: "Chiave API mancante o non valida (header X-API-Key)." },
      { status: 401 }
    );
  }

  if (!query) {
    return NextResponse.json({ errore: "Parametro 'partner' obbligatorio." }, { status: 400 });
  }

  const esito = await verificaPartner(query);

  await prisma.richiestaVerifica.create({
    data: {
      origine: app,
      queryPartner: query,
      partnerId: esito.trovato ? esito.partner.id : null,
      partnerNome: esito.trovato ? esito.partner.nome : null,
      esito: esito.trovato ? "trovato" : "non_trovato",
      rispostaSintesi: esito.trovato
        ? `Vendite ${esito.situazione.venditeYtd}€ · da incassare ${esito.situazione.daIncassare}€ · da bonificare ${esito.situazione.daBonificare}€`
        : esito.motivo,
      ip: indirizzo,
    },
  });

  return NextResponse.json(esito, { status: esito.trovato ? 200 : 404 });
}

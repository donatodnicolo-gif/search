import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { nomeSistema } from "@/lib/merge";
import { risolviMatch, sintesiPartner } from "@/lib/match";

// GET /api/v1/partners/match?pIva=&codiceFiscale=&nome=&citta=&idEsterno=
// Aggancio per il "primo contatto senza id": risolve l'identità e ritorna il
// match sicuro o la lista dei candidati con la confidenza. Ogni richiesta è
// registrata nello storico (RichiestaMatch) per la revisione del team.
// Se l'app manda `idEsterno` e c'è già un riferimento, risponde subito quello.
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const sistema = nomeSistema(client.nome, p.get("sistema"));
  const idEsterno = p.get("idEsterno")?.trim() || null;
  const pIva = p.get("pIva");
  const codiceFiscale = p.get("codiceFiscale");
  const nome = p.get("nome");
  const citta = p.get("citta");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const query = [
    pIva && `piva:${pIva}`,
    codiceFiscale && `cf:${codiceFiscale}`,
    nome && `nome:${nome}`,
    citta && `citta:${citta}`,
  ]
    .filter(Boolean)
    .join(" · ") || "(vuota)";

  // Già collegato per riferimento esterno: risposta immediata
  if (idEsterno) {
    const ref = await prisma.riferimentoEsterno.findUnique({
      where: { sistema_idEsterno: { sistema, idEsterno } },
      include: { partner: true },
    });
    if (ref) {
      await prisma.richiestaMatch.create({
        data: { sistema, idEsterno, tipo: "riferimento", query, esito: "agganciata", confidenza: "alta", partnerId: ref.partnerId, risolto: true, ip },
      });
      return NextResponse.json({
        esito: "agganciata",
        confidenza: "alta",
        giaCollegato: true,
        match: sintesiPartner(ref.partner),
        candidati: [],
      });
    }
  }

  const r = await risolviMatch({ pIva, codiceFiscale, nome, citta });

  await prisma.richiestaMatch.create({
    data: {
      sistema,
      idEsterno,
      tipo: r.tipo,
      query,
      esito: r.esito,
      confidenza: r.confidenza,
      partnerId: r.match?.id ?? null,
      risolto: false,
      ip,
    },
  });

  return NextResponse.json({
    esito: r.esito,
    confidenza: r.confidenza,
    match: r.match ? sintesiPartner(r.match) : null,
    candidati: r.candidati.map(sintesiPartner),
  });
}

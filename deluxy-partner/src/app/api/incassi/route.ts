import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida, appOrigine, ipRichiesta } from "@/lib/apiauth";

// API pubblica: pagamenti riconciliati per gli altri progetti Deluxy.
// Ogni incasso/pagamento riconosciuto (ordine Shopify, fattura pagata, pagamento
// diretto, bonifico partner) ha un riferimento univoco stabile PAY-<anno>-<n>.
//
//   GET /api/incassi?riferimento=PAY-2026-000123   dettaglio di un pagamento
//   GET /api/incassi?partner=<nome|id>             pagamenti di un partner
//   GET /api/incassi?dal=2026-01-01&al=2026-06-30  per periodo (facoltativo &tipo=, &direzione=)
//   GET /api/incassi?origine=ordine_shopify:<id>   il riferimento di un record d'origine
//   Header: X-API-Key: <chiave>   (la stessa di /api/verifiche)
//
// tipo: ordine_shopify | fattura_servizi | pagamento_diretto | bonifico_partner
// direzione: in (incasso) | out (pagamento in uscita)

type Pag = Awaited<ReturnType<typeof prisma.pagamento.findFirst>>;

function pubblico(p: NonNullable<Pag>) {
  return {
    riferimento: p.riferimento,
    tipo: p.tipo,
    direzione: p.direzione,
    importo: p.importo,
    divisa: p.divisa,
    data: p.data.toISOString().slice(0, 10),
    controparte: p.controparte,
    partnerId: p.partnerId,
    descrizione: p.descrizione,
    origine: { tipo: p.origineTipo, id: p.origineId },
    registratoIl: p.createdAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const rif = sp.get("riferimento")?.trim();
  const partnerRif = sp.get("partner")?.trim();
  const origine = sp.get("origine")?.trim();
  const query = `incassi ${rif ?? partnerRif ?? origine ?? "periodo"}`;

  if (!(await chiaveApiValida(req))) {
    await prisma.richiestaVerifica.create({
      data: { origine: appOrigine(req), queryPartner: query, esito: "non_autorizzato", ip: ipRichiesta(req) },
    });
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }

  // dettaglio per riferimento
  if (rif) {
    const p = await prisma.pagamento.findUnique({ where: { riferimento: rif } });
    if (!p) return NextResponse.json({ errore: "Pagamento non trovato." }, { status: 404 });
    return NextResponse.json(pubblico(p));
  }

  // riferimento di un record d'origine (es. "ordine_shopify:<id>")
  if (origine) {
    const [tipo, id] = origine.split(":");
    if (!tipo || !id) {
      return NextResponse.json({ errore: "Formato 'origine' non valido: usare tipo:id." }, { status: 400 });
    }
    const p = await prisma.pagamento.findUnique({ where: { origineTipo_origineId: { origineTipo: tipo, origineId: id } } });
    if (!p) return NextResponse.json({ errore: "Nessun pagamento per questa origine." }, { status: 404 });
    return NextResponse.json(pubblico(p));
  }

  // elenco per partner
  if (partnerRif) {
    const partner =
      (await prisma.partner.findUnique({ where: { id: partnerRif } })) ??
      (await prisma.partner.findFirst({ where: { nome: { equals: partnerRif, mode: "insensitive" } } }));
    if (!partner) return NextResponse.json({ errore: "Partner non trovato." }, { status: 404 });
    const pagamenti = await prisma.pagamento.findMany({
      where: { partnerId: partner.id },
      orderBy: [{ data: "desc" }],
      take: 500,
    });
    return NextResponse.json({ partner: { id: partner.id, nome: partner.nome }, pagamenti: pagamenti.map(pubblico) });
  }

  // elenco per periodo (+ filtri tipo/direzione)
  const parseData = (s: string | null) => {
    if (!s) return undefined;
    const d = new Date(s + "T00:00:00.000Z");
    return isNaN(d.getTime()) ? undefined : d;
  };
  const dal = parseData(sp.get("dal"));
  const al = parseData(sp.get("al"));
  const tipo = sp.get("tipo")?.trim() || undefined;
  const direzione = sp.get("direzione")?.trim() || undefined;
  const pagamenti = await prisma.pagamento.findMany({
    where: {
      ...(dal || al ? { data: { ...(dal ? { gte: dal } : {}), ...(al ? { lte: al } : {}) } } : {}),
      ...(tipo ? { tipo } : {}),
      ...(direzione ? { direzione } : {}),
    },
    orderBy: [{ data: "desc" }],
    take: 1000,
  });
  return NextResponse.json({
    conteggio: pagamenti.length,
    totale: +pagamenti.reduce((a, p) => a + p.importo, 0).toFixed(2),
    pagamenti: pagamenti.map(pubblico),
  });
}

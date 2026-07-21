import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chiaveApiValida, appOrigine, ipRichiesta } from "@/lib/apiauth";
import { riepilogoPartner, ANNO_CORRENTE } from "@/lib/queries";

// API pubblica: riepilogo finanziario di un partner, per la card "Finance" delle
// altre app Deluxy (es. Scout, sulla scheda cliente).
//
//   GET /api/riepilogo-finanziario?partner=<nome|id>[&anno=2026]
//   Header: X-API-Key: <chiave>   (la stessa di /api/verifiche e /api/proforma)
//   Header: X-App: <nome-app>     (facoltativo, per lo storico)
//
// "Fatturato" = aggregato di testata della scheda partner: vendite come vendor
// (incasso lordo) + servizi fatturati (netto IVA). Confronto YTD contro lo stesso
// periodo dell'anno precedente. `mesi` è l'andamento mensile (12 valori) per il
// mini-grafico. Ogni richiesta è registrata nello storico (come /api/verifiche).

// Metrica di "fatturato" del mese: incasso vendite + servizi fatturati netto IVA.
function valoreMese(r: { vendite: number; serviziNetto: number }): number {
  return r.vendite + r.serviziNetto;
}

async function trovaPartner(rif: string) {
  const perId = await prisma.partner.findUnique({ where: { id: rif } });
  if (perId) return { partner: perId, candidati: [] as string[] };
  const perNome = await prisma.partner.findFirst({
    where: { nome: { equals: rif, mode: "insensitive" } },
  });
  if (perNome) return { partner: perNome, candidati: [] as string[] };
  const simili = await prisma.partner.findMany({
    where: { nome: { contains: rif, mode: "insensitive" } },
    take: 5,
  });
  if (simili.length === 1) return { partner: simili[0], candidati: [] as string[] };
  return { partner: null, candidati: simili.map((p) => p.nome) };
}

async function log(req: NextRequest, query: string, esito: string, sintesi?: string, partner?: { id: string; nome: string } | null) {
  await prisma.richiestaVerifica.create({
    data: {
      origine: appOrigine(req),
      queryPartner: query,
      partnerId: partner?.id ?? null,
      partnerNome: partner?.nome ?? null,
      esito,
      rispostaSintesi: sintesi ?? null,
      ip: ipRichiesta(req),
    },
  });
}

export async function GET(req: NextRequest) {
  if (!(await chiaveApiValida(req))) {
    return NextResponse.json({ errore: "Chiave API mancante o non valida (header X-API-Key)." }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const partnerRif = sp.get("partner")?.trim();
  if (!partnerRif) {
    return NextResponse.json({ errore: "Parametro 'partner' obbligatorio (nome o id)." }, { status: 400 });
  }
  const annoParam = parseInt(sp.get("anno") ?? "");
  const anno = Number.isFinite(annoParam) ? annoParam : ANNO_CORRENTE;
  const annoPrec = anno - 1;

  const { partner, candidati } = await trovaPartner(partnerRif);
  if (!partner) {
    await log(req, partnerRif, "non_trovato", candidati.length ? `simili: ${candidati.join(", ")}` : undefined);
    return NextResponse.json(
      { errore: "Partner non trovato.", candidati },
      { status: 404 }
    );
  }

  const [{ mesi }, prec] = await Promise.all([
    riepilogoPartner(partner.id, anno),
    riepilogoPartner(partner.id, annoPrec),
  ]);

  // Ultimo mese con dati (per il confronto YTD sullo stesso periodo). Se non c'è
  // nulla nell'anno, il periodo è vuoto e il fatturato è 0.
  const conDati = mesi.filter((m) => m.fatture.length || m.vendite.length || m.saldo);
  const ultimoMese = conDati.length ? Math.max(...conDati.map((m) => m.mese)) : 0;

  const mesiVal = mesi.map((m) => valoreMese(m.riepilogo)); // 12 valori, gen→dic
  const mesiPrecVal = prec.mesi.map((m) => valoreMese(m.riepilogo));

  const somma = (arr: number[]) => arr.slice(0, ultimoMese).reduce((a, v) => a + v, 0);
  const fatturato = somma(mesiVal);
  const fatturatoPrec = somma(mesiPrecVal);
  const variazionePct = fatturatoPrec > 0 ? ((fatturato - fatturatoPrec) / fatturatoPrec) * 100 : null;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  await log(req, partnerRif, "trovato", `${partner.nome}: fatturato ${round2(fatturato)} (${anno})`, partner);

  return NextResponse.json({
    partner: { id: partner.id, nome: partner.nome },
    anno,
    annoPrec,
    base: "vendite vendor (incasso lordo) + servizi fatturati (netto IVA)",
    fatturato: round2(fatturato),
    fatturatoPrec: round2(fatturatoPrec),
    variazionePct: variazionePct == null ? null : round2(variazionePct),
    periodo: { daMese: ultimoMese ? 1 : 0, aMese: ultimoMese },
    mesi: mesiVal.map(round2), // andamento anno corrente (12 valori, gen→dic)
    mesiPrec: mesiPrecVal.map(round2), // stesso, anno precedente
    url: `https://deluxy-partner.vercel.app/partner/${partner.id}`,
  });
}

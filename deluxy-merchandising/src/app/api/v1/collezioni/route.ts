import { NextRequest, NextResponse } from "next/server";
import { autentica } from "@/lib/api-auth";
import { descriviRegole, posizioniDa, regoleInOEd } from "@/lib/collezioni";
import { prisma } from "@/lib/db";
import { FILTRO_BUON_FINE, finestra } from "@/lib/vendite";

export const dynamic = "force-dynamic";

// GET /api/v1/collezioni — le collezioni dei negozi, per le altre app Deluxy.
//
// Espone sia quello che dice Shopify (titolo, handle, tipo, condizioni, SEO)
// sia quello che decidiamo qui (posizioni, campagne, stato, note) e come hanno
// venduto. Marketing la usa per sapere quali collezioni può mettere in
// campagna; il sito, per sapere che cosa va in vetrina.
//
// Filtri: ?negozio=&posizione=&campagne=1&stato=attiva&q=
// Paginazione: ?page=1&limit=50 (max 200)
export async function GET(req: NextRequest) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const p = req.nextUrl.searchParams;
  const page = Math.max(1, Number(p.get("page") ?? "1") || 1);
  const limit = Math.min(200, Math.max(1, Number(p.get("limit") ?? "50") || 50));
  const giorni = Math.min(365, Math.max(7, Number(p.get("giorni") ?? "90") || 90));

  const where: Record<string, unknown> = {};
  if (p.get("negozio")) where.negozio = p.get("negozio");
  if (p.get("stato")) where.stato = p.get("stato");
  if (p.get("campagne") === "1") where.inCampagne = true;
  if (p.get("posizione")) where.posizioni = { contains: p.get("posizione") as string };
  if (p.get("q")) where.titolo = { contains: p.get("q") as string, mode: "insensitive" };

  const [totale, righe] = await Promise.all([
    prisma.collezioneShopify.count({ where }),
    prisma.collezioneShopify.findMany({
      where,
      orderBy: [{ negozio: "asc" }, { titolo: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: { prodotti: { select: { prodottoId: true } } },
    }),
  ]);

  // Il venduto delle collezioni della pagina, in una query sola.
  const f = finestra(giorni);
  const idProdotti = [...new Set(righe.flatMap((c) => c.prodotti.map((x) => x.prodottoId)))];
  const vendite = idProdotti.length
    ? await prisma.vendita.groupBy({
        by: ["prodottoId"],
        where: { prodottoId: { in: idProdotti }, data: { gte: f.dal, lte: f.al }, ...FILTRO_BUON_FINE },
        _sum: { quantita: true, ricavo: true },
      })
    : [];
  const perProdotto = new Map(vendite.map((v) => [v.prodottoId as string, v]));

  return NextResponse.json({
    totale,
    page,
    limit,
    pagine: Math.max(1, Math.ceil(totale / limit)),
    periodoVenduto: { giorni, dal: f.dal.toISOString(), al: f.al.toISOString() },
    collezioni: righe.map((c) => {
      const pezzi = c.prodotti.reduce((s, x) => s + (perProdotto.get(x.prodottoId)?._sum.quantita ?? 0), 0);
      const ricavo = c.prodotti.reduce((s, x) => s + (perProdotto.get(x.prodottoId)?._sum.ricavo ?? 0), 0);
      return {
        id: c.id,
        negozio: c.negozio,
        shopifyId: c.shopifyId,
        handle: c.handle,
        titolo: c.titolo,
        descrizione: c.descrizione,
        immagine: c.immagine,
        // Come l'ha fatta il negozio
        shopify: {
          tipo: c.tipo,
          ordinamento: c.ordinamento,
          condizioni: descriviRegole(c.regole),
          condizioniDaRispettare: regoleInOEd(c.regole),
          seoTitolo: c.seoTitolo,
          seoDescrizione: c.seoDescrizione,
          modelloTema: c.modelloTema,
          prodottiSulNegozio: c.prodottiShopify,
          aggiornataIl: c.aggiornataShopifyIl?.toISOString() ?? null,
        },
        // Come la usiamo noi: queste decisioni vivono solo qui
        merchandising: {
          stato: c.stato,
          posizioni: posizioniDa(c.posizioni),
          inCampagne: c.inCampagne,
          note: c.note,
        },
        prodottiRiconosciuti: c.prodotti.length,
        venduto: { pezzi, ricavo: Math.round(ricavo * 100) / 100 },
      };
    }),
  });
}

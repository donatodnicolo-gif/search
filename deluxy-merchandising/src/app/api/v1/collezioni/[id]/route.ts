import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { descriviRegole, posizioniDa, regoleInOEd } from "@/lib/collezioni";
import { prisma } from "@/lib/db";
import { FILTRO_BUON_FINE, finestra } from "@/lib/vendite";

export const dynamic = "force-dynamic";

// GET /api/v1/collezioni/:id — la collezione con dentro i suoi prodotti.
// Si accetta sia l'id di Merchandising sia l'handle di Shopify, perché chi
// integra spesso ha in mano quello del sito.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;
  const { id } = await params;

  const c = await prisma.collezioneShopify.findFirst({
    where: { OR: [{ id }, { handle: id }] },
    include: {
      prodotti: {
        include: {
          prodotto: {
            select: {
              id: true,
              codice: true,
              nome: true,
              categoria: true,
              tipoShopify: true,
              prezzoVendita: true,
              costoProduzione: true,
              immagine: true,
              handleShopify: true,
              esclusoDaAnalisi: true,
              varianti: { select: { nome: true, sku: true, giacenza: true } },
            },
          },
        },
      },
    },
  });
  if (!c) return erroreApi(404, "Collezione non trovata.");

  const giorni = Math.min(365, Math.max(7, Number(req.nextUrl.searchParams.get("giorni") ?? "90") || 90));
  const f = finestra(giorni);
  const ids = c.prodotti.map((x) => x.prodottoId);
  const vendite = ids.length
    ? await prisma.vendita.groupBy({
        by: ["prodottoId"],
        where: { prodottoId: { in: ids }, data: { gte: f.dal, lte: f.al }, ...FILTRO_BUON_FINE },
        _sum: { quantita: true, ricavo: true },
      })
    : [];
  const v = new Map(vendite.map((x) => [x.prodottoId as string, x]));

  return NextResponse.json({
    id: c.id,
    negozio: c.negozio,
    shopifyId: c.shopifyId,
    handle: c.handle,
    titolo: c.titolo,
    descrizione: c.descrizione,
    immagine: c.immagine,
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
    merchandising: {
      stato: c.stato,
      posizioni: posizioniDa(c.posizioni),
      inCampagne: c.inCampagne,
      note: c.note,
    },
    periodoVenduto: { giorni, dal: f.dal.toISOString(), al: f.al.toISOString() },
    prodotti: c.prodotti.map((r) => ({
      id: r.prodotto.id,
      codice: r.prodotto.codice,
      nome: r.prodotto.nome,
      categoria: r.prodotto.categoria,
      tipoShopify: r.prodotto.tipoShopify,
      handleShopify: r.prodotto.handleShopify,
      prezzo: r.prodotto.prezzoVendita,
      // Il costo esce solo se c'è davvero: zero non è un costo, è un dato mancante.
      costo: r.prodotto.costoProduzione > 0 ? r.prodotto.costoProduzione : null,
      immagine: r.prodotto.immagine,
      esclusoDaAnalisi: r.prodotto.esclusoDaAnalisi,
      varianti: r.prodotto.varianti,
      venduto: {
        pezzi: v.get(r.prodotto.id)?._sum.quantita ?? 0,
        ricavo: Math.round((v.get(r.prodotto.id)?._sum.ricavo ?? 0) * 100) / 100,
      },
    })),
  });
}

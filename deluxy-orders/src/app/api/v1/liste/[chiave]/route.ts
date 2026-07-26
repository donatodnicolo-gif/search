import { NextRequest, NextResponse } from "next/server";
import { autentica, erroreApi } from "@/lib/api-auth";
import { codificaChiave, contaClienti, elencoClienti, ordinamentoValido } from "@/lib/clienti";
import { lista } from "@/lib/segmenti";

// GET /api/v1/liste/{chiave} — i clienti di una lista, per le altre app.
// Filtri: q (ricerca), ordina (speso|ordini|recenti|nome).
// Paginazione: page (1..), limit (default 100, max 500).
//
// Il `cliente` è lo stesso identificatore usato dalla UI (base64url della
// chiave email → telefono → nome): con quello si apre la scheda su
// /clienti/{cliente} e si riconosce la stessa persona fra app diverse.
export async function GET(req: NextRequest, ctx: { params: Promise<{ chiave: string }> }) {
  const client = await autentica(req);
  if (client instanceof NextResponse) return client;

  const { chiave } = await ctx.params;
  const l = lista(chiave);
  if (!l) return erroreApi(404, `Lista sconosciuta: ${chiave}`);

  const p = req.nextUrl.searchParams;
  const q = p.get("q")?.trim() || undefined;
  const ordina = ordinamentoValido(p.get("ordina") ?? undefined);
  const page = Math.max(1, Number(p.get("page") ?? "1") || 1);
  const limit = Math.min(500, Math.max(1, Number(p.get("limit") ?? "100") || 100));

  const [totale, clienti] = await Promise.all([
    contaClienti(q, l.chiave),
    elencoClienti(q, ordina, (page - 1) * limit, limit, l.chiave),
  ]);

  return NextResponse.json({
    lista: { chiave: l.chiave, nome: l.nome, famiglia: l.famiglia, criterio: l.criterio, consiglio: l.consiglio },
    totale,
    page,
    limit,
    pagine: Math.max(1, Math.ceil(totale / limit)),
    annullatiInclusi: false,
    clienti: clienti.map((c) => ({
      cliente: codificaChiave(c.chiave),
      nome: c.nome,
      email: c.email,
      telefono: c.telefono,
      citta: c.citta,
      ordini: c.ordini,
      annullati: c.annullati,
      speso: Math.round(c.speso * 100) / 100,
      ordineMedio: Math.round(c.medio * 100) / 100,
      primoOrdine: c.primoOrdine,
      ultimoOrdine: c.ultimoOrdine,
      giorniDallUltimo: c.giorni,
      brand: c.brand,
      segmento: c.segmento,
      tipologia: c.tipologia,
      tipologiaManuale: c.tipoManuale != null,
    })),
  });
}

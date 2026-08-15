import { NextRequest } from "next/server";
import { brandCorrente, filtroProdotti } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { etichettaCategoria, ETICHETTA_FASE } from "@/lib/dominio";
import { FILTRO_BUON_FINE, finestra } from "@/lib/vendite";

// L'anagrafica intera in CSV, con gli stessi filtri della pagina: serve a
// lavorarci in foglio di calcolo (compilare i costi, decidere le categorie) e a
// rimetterli poi dentro. Punto e virgola + BOM: Excel italiano lo apre senza
// chiedere niente.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const brand = await brandCorrente();

  const where: Record<string, unknown> = { ...filtroProdotti(brand) };
  const q = sp.get("q");
  if (q)
    where.OR = [
      { nome: { contains: q, mode: "insensitive" } },
      { codice: { contains: q, mode: "insensitive" } },
      { varianti: { some: { sku: { contains: q, mode: "insensitive" } } } },
    ];
  // Gli stessi filtri della pagina, uno per uno: se qui ne manca uno il CSV
  // scarica più righe di quelle che l'utente sta guardando, e sembra che l'app
  // abbia sbagliato i conti.
  if (sp.get("categoria")) where.categoria = sp.get("categoria");
  if (sp.get("tipo")) where.tipoShopify = sp.get("tipo");
  if (sp.get("fornitore")) where.vendorShopify = sp.get("fornitore");
  if (sp.get("linea")) where.lineaId = sp.get("linea");
  if (sp.get("fase")) where.fase = sp.get("fase");
  const manca = sp.get("manca");
  if (manca === "costo") where.costoProduzione = { lte: 0 };
  if (manca === "categoria") where.categoria = "DA_CLASSIFICARE";
  if (manca === "collezione") where.collezioniShopify = { none: {} };
  if (manca === "tipo") where.tipoShopify = null;
  if (manca === "esclusi") where.esclusoDaAnalisi = true;
  else if (manca === "linea") where.lineaId = null;
  else if (manca === "fornitore") where.vendorShopify = null;

  const f = finestra(90);
  const [prodotti, vendite] = await Promise.all([
    prisma.prodotto.findMany({
      where,
      orderBy: [{ nome: "asc" }],
      include: {
        varianti: { select: { nome: true, sku: true, giacenza: true } },
        collezione: { select: { nome: true } },
        linea: { select: { nome: true } },
        collezioniShopify: { include: { collezione: { select: { titolo: true, negozio: true } } } },
      },
    }),
    prisma.vendita.groupBy({
      by: ["prodottoId"],
      where: { data: { gte: f.dal, lte: f.al }, ...FILTRO_BUON_FINE, ...(brand ? { canale: brand } : {}) },
      _sum: { quantita: true, ricavo: true },
    }),
  ]);
  const venduto = new Map(vendite.map((v) => [v.prodottoId as string, v]));

  const esc = (v: unknown) => {
    let s = String(v ?? "");
    // Un valore che inizia con = + - @ diventa una FORMULA quando Excel apre il
    // file — e qui dentro passano nomi e tag scritti sul negozio anche da app
    // terze. L'apostrofo davanti lo fa leggere come testo; i numeri veri (es.
    // «-5») restano numeri.
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const num = (n: number) => (n || 0).toFixed(2).replace(".", ",");

  const righe: (string | number)[][] = [
    [
      "Codice",
      "Nome",
      "Categoria dal negozio",
      "Categoria Deluxy",
      "Linea",
      "Fornitore",
      "Tag",
      "Varianti",
      "SKU",
      "Giacenza",
      "Prezzo",
      "Costo",
      "Collezione maison",
      "Collezioni Shopify",
      "Negozi",
      "Pezzi 90gg",
      "Venduto 90gg",
      "Fase",
      "Stato Shopify",
    ],
    ...prodotti.map((p) => {
      const v = venduto.get(p.id);
      const negozi = [...new Set(p.collezioniShopify.map((c) => c.collezione.negozio))];
      return [
        esc(p.codice),
        esc(p.nome),
        esc(p.tipoShopify ?? ""),
        esc(etichettaCategoria(p.categoria)),
        esc(p.linea?.nome ?? ""),
        esc(p.vendorShopify ?? ""),
        esc(p.tagShopify ?? ""),
        esc(p.varianti.map((x) => x.nome).join(" | ")),
        esc(p.varianti.map((x) => x.sku ?? "").filter(Boolean).join(" | ")),
        p.varianti.reduce((s, x) => s + x.giacenza, 0),
        num(p.prezzoVendita),
        num(p.costoProduzione),
        esc(p.collezione?.nome ?? ""),
        esc(p.collezioniShopify.map((c) => c.collezione.titolo).join(" | ")),
        esc(negozi.join(" | ")),
        v?._sum.quantita ?? 0,
        num(v?._sum.ricavo ?? 0),
        esc(ETICHETTA_FASE[p.fase] ?? p.fase),
        esc(p.shopifyStato),
      ];
    }),
  ];

  const csv = "﻿" + righe.map((r) => r.join(";")).join("\r\n");
  const nome = `anagrafica-prodotti${brand ? `-${brand.replace(/[^a-zA-Z0-9]/g, "")}` : ""}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  });
}

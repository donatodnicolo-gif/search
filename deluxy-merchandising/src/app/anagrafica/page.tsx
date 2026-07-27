import Link from "next/link";
import { Badge } from "@/components/Badge";
import { FormFiltri } from "@/components/FormFiltri";
import { Sidebar } from "@/components/Sidebar";
import { brandCorrente, filtroProdotti } from "@/lib/brand";
import { prisma } from "@/lib/db";
import {
  CATEGORIE,
  COLORE_FASE,
  ETICHETTA_FASE,
  etichettaCategoria,
  euro,
  FASI_PLM,
} from "@/lib/dominio";
import { FILTRO_BUON_FINE, finestra } from "@/lib/vendite";

export const dynamic = "force-dynamic";

const PER_PAGINA = 100;

// L'anagrafica: la scheda di riga di **ogni** prodotto, con tutto quello che
// l'app sa — codice, nome, tipo dal negozio, categoria interna, SKU delle
// varianti, prezzo, costo, collezioni Shopify, venduto. È la vista da cui si
// capisce cosa manca: i buchi si vedono perché sono scritti «—», non perché
// qualcuno li ha riempiti con un valore di comodo.
export default async function AnagraficaPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    categoria?: string;
    tipo?: string;
    fase?: string;
    manca?: string;
    pagina?: string;
  }>;
}) {
  const sp = await searchParams;
  const brand = await brandCorrente();
  const pagina = Math.max(1, parseInt(sp.pagina ?? "1", 10) || 1);

  const where: Record<string, unknown> = { ...filtroProdotti(brand) };
  if (sp.q)
    where.OR = [
      { nome: { contains: sp.q, mode: "insensitive" } },
      { codice: { contains: sp.q, mode: "insensitive" } },
      { varianti: { some: { sku: { contains: sp.q, mode: "insensitive" } } } },
    ];
  if (sp.categoria) where.categoria = sp.categoria;
  if (sp.tipo) where.tipoShopify = sp.tipo;
  if (sp.fase) where.fase = sp.fase;
  if (sp.manca === "costo") where.costoProduzione = { lte: 0 };
  if (sp.manca === "categoria") where.categoria = "DA_CLASSIFICARE";
  if (sp.manca === "collezione") where.collezioniShopify = { none: {} };
  if (sp.manca === "tipo") where.tipoShopify = null;

  const f = finestra(90);

  const [prodotti, totale, tipi, venditePeriodo] = await Promise.all([
    prisma.prodotto.findMany({
      where,
      orderBy: [{ nome: "asc" }],
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
      include: {
        varianti: { select: { nome: true, sku: true, giacenza: true } },
        collezione: { select: { nome: true } },
        collezioniShopify: { include: { collezione: { select: { titolo: true, negozio: true } } } },
      },
    }),
    prisma.prodotto.count({ where }),
    prisma.prodotto.findMany({
      where: { tipoShopify: { not: null } },
      distinct: ["tipoShopify"],
      select: { tipoShopify: true },
      orderBy: { tipoShopify: "asc" },
    }),
    prisma.vendita.groupBy({
      by: ["prodottoId"],
      where: { data: { gte: f.dal, lte: f.al }, ...FILTRO_BUON_FINE, ...(brand ? { canale: brand } : {}) },
      _sum: { quantita: true, ricavo: true },
    }),
  ]);

  const venduto = new Map(venditePeriodo.map((v) => [v.prodottoId as string, v]));
  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const link = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "pagina") q.set(k, v);
    if (n > 1) q.set("pagina", String(n));
    const s = q.toString();
    return s ? `/anagrafica?${s}` : "/anagrafica";
  };
  const querySenzaPagina = (() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "pagina") q.set(k, v);
    return q.toString();
  })();

  return (
    <div className="layout">
      <Sidebar attiva="anagrafica" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Anagrafica prodotti{brand ? ` — ${brand}` : ""}</h1>
            <p className="page-sub">
              Tutti i prodotti con tutto quello che l&apos;app ne sa: codice, SKU, tipo dal negozio, categoria,
              prezzi, collezioni Shopify e venduto a 90 giorni. Quello che manca è scritto «—»: è la lista da
              cui si vede cosa c&apos;è da compilare.
            </p>
          </div>
          <a className="btn btn-secondario" href={`/anagrafica/csv${querySenzaPagina ? `?${querySenzaPagina}` : ""}`}>
            Scarica CSV
          </a>
        </div>

        <FormFiltri>
          <input type="search" name="q" placeholder="Cerca per nome, codice o SKU…" defaultValue={sp.q ?? ""} />
          <select name="categoria" defaultValue={sp.categoria ?? ""} aria-label="Categoria">
            <option value="">Tutte le categorie</option>
            {CATEGORIE.map((c) => (
              <option key={c} value={c}>
                {etichettaCategoria(c)}
              </option>
            ))}
          </select>
          <select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo su Shopify">
            <option value="">Tutti i tipi Shopify</option>
            {tipi.map((t) => (
              <option key={t.tipoShopify as string} value={t.tipoShopify as string}>
                {t.tipoShopify}
              </option>
            ))}
          </select>
          <select name="fase" defaultValue={sp.fase ?? ""} aria-label="Fase">
            <option value="">Tutte le fasi</option>
            {FASI_PLM.map((x) => (
              <option key={x} value={x}>
                {ETICHETTA_FASE[x]}
              </option>
            ))}
          </select>
          <select name="manca" defaultValue={sp.manca ?? ""} aria-label="Cosa manca">
            <option value="">Completi e incompleti</option>
            <option value="costo">Senza costo di produzione</option>
            <option value="categoria">Da classificare</option>
            <option value="tipo">Senza tipo da Shopify</option>
            <option value="collezione">Fuori da ogni collezione Shopify</option>
          </select>
          <button className="btn btn-secondario" type="submit">
            Filtra
          </button>
        </FormFiltri>

        <p className="page-sub" style={{ margin: "0 0 12px" }}>
          {totale} prodotti{pagine > 1 ? ` · pagina ${pagina} di ${pagine}` : ""}
        </p>

        {prodotti.length === 0 ? (
          <div className="vuoto">Nessun prodotto con questi filtri.</div>
        ) : (
          <div className="tabella-wrap">
            <table>
              <thead>
                <tr>
                  <th>Prodotto</th>
                  <th>Tipo su Shopify</th>
                  <th>Categoria</th>
                  <th>Varianti e SKU</th>
                  <th className="num">Prezzo</th>
                  <th className="num">Costo</th>
                  <th>Collezioni</th>
                  <th className="num">Venduto 90gg</th>
                  <th>Fase</th>
                </tr>
              </thead>
              <tbody>
                {prodotti.map((p) => {
                  const v = venduto.get(p.id);
                  return (
                    <tr key={p.id} className="riga-cliccabile">
                      <td>
                        <Link href={`/prodotti/${p.id}`} className="cella-nome link-riga">
                          {p.nome}
                        </Link>
                        <div className="cella-sub">
                          {p.codice}
                          {p.vendorShopify ? ` · ${p.vendorShopify}` : ""}
                        </div>
                      </td>
                      <td className="cella-muta">{p.tipoShopify ?? "—"}</td>
                      <td className="cella-muta">{etichettaCategoria(p.categoria)}</td>
                      <td className="cella-muta">
                        {p.varianti.length === 0
                          ? "—"
                          : p.varianti
                              .slice(0, 3)
                              .map((x) => `${x.nome}${x.sku ? ` (${x.sku})` : ""}`)
                              .join(" · ")}
                        {p.varianti.length > 3 && ` +${p.varianti.length - 3}`}
                      </td>
                      <td className="num">{p.prezzoVendita > 0 ? euro(p.prezzoVendita) : "—"}</td>
                      <td className="num" style={{ color: p.costoProduzione > 0 ? undefined : "var(--orange)" }}>
                        {p.costoProduzione > 0 ? euro(p.costoProduzione) : "—"}
                      </td>
                      <td className="cella-muta">
                        {p.collezioniShopify.length === 0
                          ? p.collezione?.nome ?? "—"
                          : p.collezioniShopify
                              .slice(0, 2)
                              .map((c) => c.collezione.titolo)
                              .join(" · ")}
                        {p.collezioniShopify.length > 2 && ` +${p.collezioniShopify.length - 2}`}
                      </td>
                      <td className="num">
                        {v ? euro(v._sum.ricavo ?? 0) : "—"}
                        {v && <div className="cella-sub">{v._sum.quantita} pz</div>}
                      </td>
                      <td>
                        <Badge
                          testo={ETICHETTA_FASE[p.fase] ?? p.fase}
                          colore={COLORE_FASE[p.fase] ?? "var(--text-tertiary)"}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagine > 1 && (
          <div className="paginazione">
            {pagina > 1 && (
              <a className="btn btn-secondario small" href={link(pagina - 1)}>
                ← Precedenti
              </a>
            )}
            <span className="paginazione-stato">
              {(pagina - 1) * PER_PAGINA + 1}–{Math.min(pagina * PER_PAGINA, totale)} di {totale}
            </span>
            {pagina < pagine && (
              <a className="btn btn-secondario small" href={link(pagina + 1)}>
                Successivi →
              </a>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

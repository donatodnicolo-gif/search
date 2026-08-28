import { Sidebar } from "@/components/Sidebar";
import { FormFiltri } from "@/components/FormFiltri";
import { TabellaProdotti } from "@/components/TabellaProdotti";
import { brandCorrente, filtroProdotti } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { CATEGORIE, ETICHETTA_CATEGORIA, ETICHETTA_FASE, FASI_PLM } from "@/lib/dominio";

export const dynamic = "force-dynamic";

export default async function ProdottiPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    collezione?: string;
    categoria?: string;
    fase?: string;
    uniti?: string;
    pagina?: string;
  }>;
}) {
  const sp = await searchParams;
  // Dentro un brand si vedono i prodotti **venduti su quel brand**: il brand non
  // è un campo della scheda prodotto, è una proprietà del venduto.
  const brand = await brandCorrente();
  const where: Record<string, unknown> = { ...filtroProdotti(brand) };
  // La ricerca non distingue le maiuscole (Libro UX&UI v1.9 §8-bis): «torta»
  // deve trovare anche «Torta», come già fa l'anagrafica.
  if (sp.q)
    where.OR = [
      { nome: { contains: sp.q, mode: "insensitive" } },
      { codice: { contains: sp.q, mode: "insensitive" } },
    ];
  if (sp.collezione) where.collezioneId = sp.collezione;
  if (sp.categoria) where.categoria = sp.categoria;
  if (sp.fase) where.fase = sp.fase;
  // Le schede unite ad altre restano in anagrafica, ma qui starebbero come
  // doppioni: si nascondono di default e **lo si scrive**, con l'interruttore
  // per rivederle. Nasconderle in silenzio sarebbe farle sparire.
  const mostraUnite = sp.uniti === "si";
  if (!mostraUnite) where.unitoAId = null;

  // Il catalogo può contenere migliaia di prodotti (l'import dal venduto ne ha
  // creati oltre duemila): senza pagina la tabella pesa megabyte e la pagina
  // impiega decine di secondi. Si mostrano 100 prodotti per volta, dicendo
  // sempre quanti sono in tutto.
  const PER_PAGINA = 100;
  const pagina = Math.max(1, parseInt(sp.pagina ?? "1", 10) || 1);

  const [prodotti, totale, collezioni, quanteUnite] = await Promise.all([
    prisma.prodotto.findMany({
      where,
      orderBy: [{ priorita: "desc" }, { creatoIl: "desc" }],
      include: { collezione: { select: { nome: true, margineTarget: true } } },
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
    prisma.prodotto.count({ where }),
    prisma.collezione.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.prodotto.count({ where: { unitoAId: { not: null } } }),
  ]);

  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  const linkPagina = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "pagina") q.set(k, v);
    if (n > 1) q.set("pagina", String(n));
    const s = q.toString();
    return s ? `/prodotti?${s}` : "/prodotti";
  };

  return (
    <div className="layout">
      <Sidebar attiva="prodotti" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Prodotti{brand ? ` — ${brand}` : ""}</h1>
            <p className="page-sub">
              {brand
                ? `I prodotti venduti almeno una volta su ${brand}. Filtra per collezione, categoria o fase del ciclo di vita.`
                : "Il catalogo completo: filtra per collezione, categoria o fase del ciclo di vita."}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a className="btn btn-secondario" href="/prodotti/riconcilia">Riconcilia doppioni</a>
            <a className="btn btn-secondario" href="/prodotti/nuovo">Nuovo prodotto</a>
            <a className="btn" href="/prodotti/nuovo-shopify">Nuovo su Shopify</a>
          </div>
        </div>

        <FormFiltri>
          <input type="search" name="q" placeholder="Cerca per nome o codice…" defaultValue={sp.q ?? ""} />
          <select name="collezione" defaultValue={sp.collezione ?? ""}>
            <option value="">Tutte le collezioni</option>
            {collezioni.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          <select name="categoria" defaultValue={sp.categoria ?? ""}>
            <option value="">Tutte le categorie</option>
            {CATEGORIE.map((c) => (
              <option key={c} value={c}>{ETICHETTA_CATEGORIA[c]}</option>
            ))}
          </select>
          <select name="fase" defaultValue={sp.fase ?? ""}>
            <option value="">Tutte le fasi</option>
            {FASI_PLM.map((f) => (
              <option key={f} value={f}>{ETICHETTA_FASE[f]}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondario">Filtra</button>
        </FormFiltri>

        <p className="page-sub" style={{ margin: "0 0 12px" }}>
          {totale} prodotti
          {pagine > 1 ? ` · pagina ${pagina} di ${pagine}` : ""}
          {quanteUnite > 0 && (
            <span>
              {` · ${quanteUnite} ${quanteUnite === 1 ? "scheda unita" : "schede unite"} ad altre `}
              {mostraUnite ? "(mostrate) " : "(nascoste) "}
              <a href={mostraUnite ? "/prodotti" : "/prodotti?uniti=si"}>
                {mostraUnite ? "nascondile" : "mostrale"}
              </a>
            </span>
          )}
        </p>
        <TabellaProdotti prodotti={prodotti} />
        {pagine > 1 && (
          <div className="paginazione">
            {pagina > 1 && (
              <a className="btn btn-secondario small" href={linkPagina(pagina - 1)}>
                ← Precedenti
              </a>
            )}
            <span className="paginazione-stato">
              {(pagina - 1) * 100 + 1}–{Math.min(pagina * 100, totale)} di {totale}
            </span>
            {pagina < pagine && (
              <a className="btn btn-secondario small" href={linkPagina(pagina + 1)}>
                Successivi →
              </a>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

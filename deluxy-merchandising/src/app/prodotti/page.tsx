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
    ordina?: string;
    verso?: string;
  }>;
}) {
  const sp = await searchParams;
  // Dentro un brand si vedono i prodotti **venduti su quel brand**: il brand non
  // è un campo della scheda prodotto, è una proprietà del venduto.
  const brand = await brandCorrente();
  const where: Record<string, unknown> = { ...(await filtroProdotti(brand)) };
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

  // **L'ordinamento delle colonne** (08/09/2026, chiesto dall'utente: «ordina la
  // tabella per data di creazione, ma consenti di ordinare tutte le colonne»).
  // Sta nell'indirizzo e si applica **nel database**: la tabella mostra 100
  // righe su migliaia, e ordinare solo quelle mostrate darebbe un primo posto
  // che vale unicamente per la pagina che si sta guardando.
  const CAMPI_ORDINE: Record<string, string> = {
    creato: "creatoIl",
    nome: "nome",
    categoria: "categoria",
    fase: "fase",
    prezzo: "prezzoVendita",
    shopify: "statoShopify",
    collezione: "collezione",
  };
  // Il default è **la data di creazione, dal più recente**: chi apre la pagina
  // cerca quasi sempre quello che ha appena caricato.
  const ordina = CAMPI_ORDINE[sp.ordina ?? ""] ? (sp.ordina as string) : "creato";
  const verso: "asc" | "desc" = sp.verso === "asc" ? "asc" : "desc";
  const campo = CAMPI_ORDINE[ordina];
  const orderBy =
    campo === "collezione"
      ? [{ collezione: { nome: verso } }, { creatoIl: "desc" as const }]
      : [{ [campo]: verso }, { creatoIl: "desc" as const }];

  const [prodotti, totale, collezioni, quanteUnite] = await Promise.all([
    prisma.prodotto.findMany({
      where,
      orderBy: orderBy as never,
      include: { collezione: { select: { nome: true, margineTarget: true } } },
      skip: (pagina - 1) * PER_PAGINA,
      take: PER_PAGINA,
    }),
    prisma.prodotto.count({ where }),
    prisma.collezione.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.prodotto.count({ where: { unitoAId: { not: null } } }),
  ]);

  const pagine = Math.max(1, Math.ceil(totale / PER_PAGINA));
  // Cliccando la colonna già attiva si **gira il verso**; cliccandone un'altra
  // si parte dal verso naturale di quel dato: le date dal più recente, i numeri
  // dal più alto, i testi dalla A. E si torna a pagina 1, perché l'ordine
  // nuovo rimescola tutto e restare a pagina 7 non vorrebbe dire niente.
  const linkOrdine = (chiave: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "pagina" && k !== "ordina" && k !== "verso") q.set(k, v);
    const naturale = chiave === "nome" || chiave === "categoria" || chiave === "fase" || chiave === "collezione" ? "asc" : "desc";
    const nuovo = ordina === chiave ? (verso === "asc" ? "desc" : "asc") : naturale;
    if (chiave !== "creato" || nuovo !== "desc") { q.set("ordina", chiave); q.set("verso", nuovo); }
    const t = q.toString();
    return t ? `/prodotti?${t}` : "/prodotti";
  };
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
              {/* La riga dice **come si sceglie chi entra**, e dal 07/09/2026 il
                  criterio è doppio: non solo il venduto, ma anche il catalogo del
                  negozio di quel brand — altrimenti un negozio appena collegato
                  mostrava una pagina vuota. Scriverlo qui evita che il numero in
                  testa venga letto come «quanti ne ho venduti». */}
              {brand
                ? `I prodotti venduti su ${brand} e quelli che stanno nelle collezioni del suo negozio. Filtra per collezione, categoria o fase del ciclo di vita.`
                : "Il catalogo completo: filtra per collezione, categoria o fase del ciclo di vita."}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a className="btn btn-secondario" href="/prodotti/pruning" title="Proponi i prodotti da spegnere sul negozio">Pruning</a>
            <a className="btn btn-secondario" href="/prodotti/riconcilia">Riconcilia doppioni</a>
            <a className="btn btn-secondario" href="/prodotti/nuovo-shopify" title="Con varianti, magazzino e campi extra">Nuovo su Shopify</a>
            <a className="btn" href="/prodotti/nuovo">Nuovo prodotto</a>
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
        <TabellaProdotti prodotti={prodotti} ordine={{ ordina, verso, link: linkOrdine }} />
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

import { Sidebar } from "@/components/Sidebar";
import { FormFiltri } from "@/components/FormFiltri";
import { TabellaProdotti } from "@/components/TabellaProdotti";
import { prisma } from "@/lib/db";
import { CATEGORIE, ETICHETTA_CATEGORIA, ETICHETTA_FASE, FASI_PLM } from "@/lib/dominio";

export const dynamic = "force-dynamic";

export default async function ProdottiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; collezione?: string; categoria?: string; fase?: string }>;
}) {
  const sp = await searchParams;
  const where: Record<string, unknown> = {};
  if (sp.q) where.OR = [{ nome: { contains: sp.q } }, { codice: { contains: sp.q } }];
  if (sp.collezione) where.collezioneId = sp.collezione;
  if (sp.categoria) where.categoria = sp.categoria;
  if (sp.fase) where.fase = sp.fase;

  const [prodotti, collezioni] = await Promise.all([
    prisma.prodotto.findMany({
      where,
      orderBy: [{ priorita: "desc" }, { creatoIl: "desc" }],
      include: { collezione: { select: { nome: true, margineTarget: true } } },
    }),
    prisma.collezione.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  return (
    <div className="layout">
      <Sidebar attiva="prodotti" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Prodotti</h1>
            <p className="page-sub">Il catalogo completo: filtra per collezione, categoria o fase del ciclo di vita.</p>
          </div>
          <a className="btn" href="/prodotti/nuovo">Nuovo prodotto</a>
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

        <p className="page-sub" style={{ margin: "0 0 12px" }}>{prodotti.length} prodotti</p>
        <TabellaProdotti prodotti={prodotti} />
      </main>
    </div>
  );
}

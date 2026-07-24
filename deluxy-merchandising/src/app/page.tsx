import { Sidebar } from "@/components/Sidebar";
import { Badge } from "@/components/Badge";
import { prisma } from "@/lib/db";
import {
  calcolaMargine,
  COLORE_STATO_COLLEZIONE,
  ETICHETTA_STATO_COLLEZIONE,
  etichettaStagione,
  euro,
  iso,
  percentuale,
} from "@/lib/dominio";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [collezioni, prodotti, inVendita, daPubblicare] = await Promise.all([
    prisma.collezione.findMany({
      orderBy: [{ anno: "desc" }, { creataIl: "desc" }],
      include: { _count: { select: { prodotti: true } }, prodotti: { select: { costoProduzione: true, prezzoVendita: true } } },
    }),
    prisma.prodotto.findMany({ select: { costoProduzione: true, prezzoVendita: true, fase: true } }),
    prisma.prodotto.count({ where: { fase: "in_vendita" } }),
    prisma.prodotto.count({ where: { shopifyStato: { not: "pubblicato" }, fase: { not: "archiviato" } } }),
  ]);

  const conPrezzo = prodotti.filter((p) => p.prezzoVendita > 0);
  const margineMedio =
    conPrezzo.length > 0
      ? conPrezzo.reduce((s, p) => s + calcolaMargine(p.costoProduzione, p.prezzoVendita).marginePct, 0) / conPrezzo.length
      : 0;

  function margineCollezione(ps: { costoProduzione: number; prezzoVendita: number }[]): number | null {
    const v = ps.filter((p) => p.prezzoVendita > 0);
    if (!v.length) return null;
    return v.reduce((s, p) => s + calcolaMargine(p.costoProduzione, p.prezzoVendita).marginePct, 0) / v.length;
  }

  return (
    <div className="layout">
      <Sidebar attiva="collezioni" />
      <main className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Collezioni</h1>
            <p className="page-sub">
              Il prodotto organizzato per stagione, come in una maison: dal concept alla vetrina, fino alla
              pubblicazione su Shopify.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a className="btn btn-secondario" href="/collezioni/nuova">Nuova collezione</a>
            <a className="btn" href="/prodotti/nuovo">Nuovo prodotto</a>
          </div>
        </div>

        <div className="kpi-riga">
          <div className="kpi">
            <div className="kpi-valore">{collezioni.length}</div>
            <div className="kpi-etichetta">Collezioni</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{inVendita}</div>
            <div className="kpi-etichetta">Prodotti in vendita</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{percentuale(margineMedio)}</div>
            <div className="kpi-etichetta">Margine medio</div>
          </div>
          <div className="kpi">
            <div className="kpi-valore">{daPubblicare}</div>
            <div className="kpi-etichetta">Da pubblicare su Shopify</div>
          </div>
        </div>

        {collezioni.length === 0 ? (
          <div className="vuoto">Nessuna collezione. Crea la prima per iniziare.</div>
        ) : (
          <div className="griglia-collezioni">
            {collezioni.map((c) => {
              const m = margineCollezione(c.prodotti);
              return (
                <a key={c.id} className="card-collezione" href={`/collezioni/${c.id}`}>
                  <div className="card-cover">
                    <span className="card-cover-stagione">{etichettaStagione(c.stagione)}</span>
                  </div>
                  <div className="card-corpo">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <span className="card-nome">{c.nome}</span>
                      <Badge testo={ETICHETTA_STATO_COLLEZIONE[c.stato]} colore={COLORE_STATO_COLLEZIONE[c.stato]} />
                    </div>
                    <p className="card-tema">{c.tema ?? c.descrizione ?? "—"}</p>
                    <div className="card-meta">
                      <span className="card-meta-num"><b>{c._count.prodotti}</b> prodotti</span>
                      <span className="card-meta-num">
                        {m != null ? <><b>{percentuale(m)}</b> margine</> : "margine —"}
                      </span>
                      <span className="card-meta-num">{c.dataLancio ? iso(c.dataLancio) : "senza data"}</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
